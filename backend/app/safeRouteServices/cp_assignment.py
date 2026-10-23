"""
SafeRoute - constraint-programming evacuation assignment (hackathon MVP)
Decides WHO goes WHERE. Hard limits: shelter seats, road capacity, minimum
route reliability, wheelchair access. Priorities: place as many people as
possible, then fair coverage, then lowest travel cost.
Solver: OR-Tools CP-SAT if installed, else SciPy MILP, else a built-in
heuristic - so it always runs, even with nothing installed.
"""
from collections import defaultdict

DEFAULT_MIN_RELIABILITY = 0.25
DEFAULT_RISK_PENALTY = 0.0   # extra cost added per unit of unreliability


# --------------------------------------------------------------- adapters
def origins_from_snapshot(snapshot):
    """Backend snapshot['origins'] -> solver origins."""
    return [{"id": o["id"], "pop": int(o["population"])} for o in snapshot["origins"]]


def shelters_from_snapshot(snapshot, free_override=None):
    """Backend snapshot['shelters'] -> solver shelters (free = capacity - occupancy)."""
    free_override = free_override or {}
    out = []
    for s in snapshot["shelters"]:
        free = free_override.get(s["id"], max(0, s["capacity"] - s["occupancy"]))
        out.append({"id": s["id"], "name": s.get("name", s["id"]), "free": int(free),
                    "capacity": s["capacity"], "occupancy": s["occupancy"],
                    "accessible": s.get("accessible", True)})
    return out


def pairs_from_planner(origins, shelters, plan_route):
    """Build the `pairs` argument by calling YOUR route finder.
    plan_route(origin, shelter) must return None (unreachable) or a dict:
        {"cost": <risk-weighted travel cost>,
         "reliability": <0..1, optional>,
         "edges": [<road ids on the route>]}"""
    pairs = {}
    for o in origins:
        for s in shelters:
            r = plan_route(o, s)
            if r:
                pairs[(o["id"], s["id"])] = r
    return pairs


# ------------------------------------------------------------ preparation
def _prepare(origins, shelters, pairs, min_reliability, risk_penalty):
    oidx = {o["id"]: i for i, o in enumerate(origins)}
    sidx = {s["id"]: i for i, s in enumerate(shelters)}
    valid = {}
    for (o_id, s_id), r in pairs.items():
        if not r or o_id not in oidx or s_id not in sidx:
            continue
        o, s = origins[oidx[o_id]], shelters[sidx[s_id]]
        rel = float(r.get("reliability", 1.0))
        if o["pop"] <= 0 or s["free"] <= 0 or rel < min_reliability:
            continue
        if o.get("needs_accessible") and not s.get("accessible", True):
            continue
        valid[(oidx[o_id], sidx[s_id])] = {
            "cost": float(r.get("cost", 0.0)) + risk_penalty * (1.0 - rel),
            "reliability": rel,
            "edges": list(r.get("edges", [])),
        }
    return valid


def _edge_users(valid, edge_capacity):
    users = defaultdict(list)
    for k, r in valid.items():
        for e in r["edges"]:
            if e in edge_capacity:
                users[e].append(k)
    return users


# ------------------------------------------------------ solver 1: CP-SAT
def _solve_cpsat(origins, shelters, valid, edge_capacity, fairness):
    from ortools.sat.python import cp_model

    m = cp_model.CpModel()
    f = {k: m.NewIntVar(0, min(origins[k[0]]["pop"], shelters[k[1]]["free"]), f"f_{k[0]}_{k[1]}")
         for k in valid}
    for oi, o in enumerate(origins):
        terms = [f[k] for k in f if k[0] == oi]
        if terms:
            m.Add(sum(terms) <= o["pop"])
    for si, s in enumerate(shelters):
        terms = [f[k] for k in f if k[1] == si]
        if terms:
            m.Add(sum(terms) <= s["free"])
    for e, ks in _edge_users(valid, edge_capacity).items():
        m.Add(sum(f[k] for k in ks) <= edge_capacity[e])

    def solve():
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10
        status = solver.Solve(m)
        ok = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        return solver, ok

    # stage 1: place as many (priority-weighted) people as possible
    weight = {k: int(origins[k[0]].get("priority", 1)) for k in valid}
    placed = sum(weight[k] * f[k] for k in f)
    m.Maximize(placed)
    solver, ok = solve()
    if not ok:
        return {}
    m.Add(placed >= int(round(solver.ObjectiveValue())))

    # stage 2: maximise the coverage of the worst-off origin (per mille)
    covered = [oi for oi in range(len(origins)) if any(k[0] == oi for k in valid)]
    if fairness and len(covered) > 1:
        t = m.NewIntVar(0, 1000, "t")
        for oi in covered:
            m.Add(1000 * sum(f[k] for k in f if k[0] == oi) >= t * origins[oi]["pop"])
        m.Maximize(t)
        solver, ok = solve()
        if ok:
            m.Add(t >= solver.Value(t))

    # stage 3: cheapest way to achieve all of the above
    m.Minimize(sum(int(round(valid[k]["cost"] * 100)) * f[k] for k in f))
    solver, ok = solve()
    if not ok:
        return {}
    return {k: solver.Value(v) for k, v in f.items() if solver.Value(v) > 0}


# --------------------------------------------- solver 2: SciPy MILP (same model)
def _solve_scipy(origins, shelters, valid, edge_capacity, fairness):
    import numpy as np
    from scipy.optimize import Bounds, LinearConstraint, milp

    keys = list(valid)
    n = len(keys)
    nv = n + 1                                    # last variable is t
    rows, upper = [], []

    def row(coeffs):
        r = np.zeros(nv)
        for j, c in coeffs.items():
            r[j] = c
        return r

    for oi, o in enumerate(origins):
        rows.append(row({j: 1 for j, k in enumerate(keys) if k[0] == oi})); upper.append(o["pop"])
    for si, s in enumerate(shelters):
        rows.append(row({j: 1 for j, k in enumerate(keys) if k[1] == si})); upper.append(s["free"])
    for e, ks in _edge_users(valid, edge_capacity).items():
        rows.append(row({keys.index(k): 1 for k in ks})); upper.append(edge_capacity[e])
    base = list(zip(rows, [-np.inf] * len(rows), upper))
    covered = [oi for oi in range(len(origins)) if any(k[0] == oi for k in valid)]
    fair_rows = []
    for oi in covered:
        r = row({j: 1000 for j, k in enumerate(keys) if k[0] == oi})
        r[n] = -origins[oi]["pop"]
        fair_rows.append((r, 0, np.inf))
    ub_f = [min(origins[k[0]]["pop"], shelters[k[1]]["free"]) for k in keys]

    def run(c, extra, t_lo, t_hi):
        cons = [LinearConstraint(r.reshape(1, -1), lo, hi) for r, lo, hi in base + fair_rows + extra]
        lb = np.array([0] * n + [t_lo], float)
        ub = np.array(ub_f + [t_hi], float)
        res = milp(c=c, constraints=cons, integrality=np.ones(nv),
                   bounds=Bounds(lb, ub), options={"mip_rel_gap": 0})
        return res

    w = np.array([int(origins[k[0]].get("priority", 1)) for k in keys] + [0], float)
    res = run(-w, [], 0, 0)                       # stage 1 (t fixed at 0)
    if res.x is None:
        return {}
    best_placed = int(round(w @ res.x))
    placed_row = [(w.copy(), best_placed, np.inf)]
    t_star = 0
    if fairness and len(covered) > 1:             # stage 2
        c2 = np.zeros(nv); c2[n] = -1
        res = run(c2, placed_row, 0, 1000)
        if res.x is not None:
            t_star = int(round(res.x[n]))
    c3 = np.array([int(round(valid[k]["cost"] * 100)) for k in keys] + [0], float)
    res = run(c3, placed_row, t_star, 1000 if t_star else 0)   # stage 3
    if res.x is None:
        return {}
    return {k: int(round(res.x[j])) for j, k in enumerate(keys) if round(res.x[j]) > 0}


# ---------------------------------- solver 3: built-in (needs NO packages)
def _solve_python(origins, shelters, valid, edge_capacity, fairness):
    """Heuristic: place people one at a time. With fairness, always serve the
    origin whose share of placed people is lowest; each person takes that
    origin's cheapest route that still has shelter seats and road capacity.
    Good enough for a demo; OR-Tools / SciPy give the proven optimum."""
    rem_o = {i: o["pop"] for i, o in enumerate(origins)}
    rem_s = [s["free"] for s in shelters]
    rem_e = dict(edge_capacity)
    placed = defaultdict(int)
    flows = defaultdict(int)
    options = defaultdict(list)
    for k in sorted(valid, key=lambda k: valid[k]["cost"]):
        options[k[0]].append(k)
    active = set(options)
    while active:
        if fairness:
            oi = min(active, key=lambda i: (placed[i] / origins[i]["pop"], i))
        else:
            oi = min(active)
        done = rem_o[oi] <= 0
        if not done:
            for k in options[oi]:
                room = min([rem_s[k[1]]] + [rem_e.get(e, float("inf")) for e in valid[k]["edges"]])
                if room > 0:
                    flows[k] += 1
                    placed[oi] += 1
                    rem_o[oi] -= 1
                    rem_s[k[1]] -= 1
                    for e in valid[k]["edges"]:
                        if e in rem_e:
                            rem_e[e] -= 1
                    break
            else:
                done = True
        if done:
            active.discard(oi)
    return dict(flows)


# --------------------------------------------------------------- public API
def solve_assignment(origins, shelters, pairs, edge_capacity=None, *, fairness=True,
                     min_reliability=DEFAULT_MIN_RELIABILITY,
                     risk_penalty=DEFAULT_RISK_PENALTY, solver="auto"):
    """origins : [{"id", "pop", "priority"?, "needs_accessible"?}]
    shelters   : [{"id", "free", "name"?, "capacity"?, "occupancy"?, "accessible"?}]
    pairs      : {(origin_id, shelter_id): {"cost", "reliability"?, "edges"?}}
    edge_capacity : {road_id: max people}   (roads missing here are unlimited)
    Returns a dict shaped like your /api/evacuation/assign response, plus
    "flows" (origin -> shelter splits) and fairness/solver info."""
    edge_capacity = edge_capacity or {}
    valid = _prepare(origins, shelters, pairs, min_reliability, risk_penalty)

    used = "none"
    flows = {}
    if valid:
        runners = {"cpsat": (_solve_cpsat, "OR-Tools CP-SAT"),
                   "scipy": (_solve_scipy, "SciPy MILP"),
                   "python": (_solve_python, "built-in heuristic")}
        order = ["cpsat", "scipy", "python"] if solver == "auto" else [solver]
        for name in order:
            fn, label = runners[name]
            try:
                flows = fn(origins, shelters, valid, edge_capacity, fairness)
                used = label
                break
            except ImportError:
                if solver != "auto":
                    raise

    return _build_result(origins, shelters, valid, flows, edge_capacity, used)


def _build_result(origins, shelters, valid, flows, edge_capacity, solver_name):
    assigned_by_s = defaultdict(int)
    assigned_by_o = defaultdict(int)
    edge_flows = defaultdict(int)
    out_flows = []
    for (oi, si), n in sorted(flows.items()):
        assigned_by_s[si] += n
        assigned_by_o[oi] += n
        for e in valid[(oi, si)]["edges"]:
            edge_flows[e] += n
        out_flows.append({"origin_id": origins[oi]["id"], "shelter_id": shelters[si]["id"],
                          "people": n, "cost": round(valid[(oi, si)]["cost"], 2),
                          "reliability": round(valid[(oi, si)]["reliability"], 3),
                          "route_edges": valid[(oi, si)]["edges"]})

    allocations = []
    for si, s in enumerate(shelters):
        n = assigned_by_s[si]
        remaining = s["free"] - n
        allocations.append({
            "shelter_id": s["id"], "shelter_name": s.get("name", s["id"]),
            "assigned_count": n, "remaining_capacity": remaining,
            "status": "full" if remaining <= 0 else "available",
            "final_occupancy": s.get("occupancy", s.get("capacity", s["free"]) - s["free"]) + n,
            "capacity": s.get("capacity", s["free"])})

    reasons = {}
    any_free = any(s["free"] > 0 for s in shelters)
    for oi, o in enumerate(origins):
        if assigned_by_o[oi] >= o["pop"]:
            continue
        has_pair = any(k[0] == oi for k in valid)
        if not any_free:
            reasons[o["id"]] = "shelters full"
        elif not has_pair:
            reasons[o["id"]] = "no safe reachable shelter (blocked, unreliable or not accessible)"
        else:
            reasons[o["id"]] = "shelter seats or road capacity exhausted"

    total = sum(o["pop"] for o in origins)
    assigned = sum(assigned_by_o.values())
    cover = [assigned_by_o[oi] / o["pop"] for oi, o in enumerate(origins)
             if o["pop"] > 0 and any(k[0] == oi for k in valid)]
    return {
        "solver": solver_name,
        "total_evacuees": total, "total_assigned": assigned, "total_unassigned": total - assigned,
        "min_origin_coverage": round(min(cover), 3) if cover else 0.0,
        "shelter_allocations": allocations,
        "flows": out_flows,
        "edge_flows": dict(edge_flows),
        "overloaded_edges": sorted(e for e, n in edge_flows.items() if n > edge_capacity.get(e, float("inf"))),
        "unassigned_reasons": reasons,
    }
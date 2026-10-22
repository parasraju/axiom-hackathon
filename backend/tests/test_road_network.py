"""Unit tests for RoadGraph and road network spatial/traversability functions."""

import pytest
import networkx as nx
from app.graph.road_network import RoadGraph, haversine_distance, EdgeDict
from app.models.schemas import RoadNode, RoadEdge, MobilityProfile


def sample_network():
    nodes = [
        RoadNode(id="N1", lon=72.8258, lat=18.9256, name="Origin Node", kind="intersection"),
        RoadNode(id="N2", lon=72.8288, lat=18.9286, name="Mid Node", kind="intersection"),
        RoadNode(id="N3", lon=72.8318, lat=18.9316, name="Shelter Node", kind="shelter"),
        RoadNode(id="N4", lon=72.8258, lat=18.9316, name="Stairs Node", kind="stairs"),
    ]
    edges = [
        RoadEdge(
            id="E1",
            from_node="N1",
            to_node="N2",
            length_m=500.0,
            baseline_speed_kmh=18.0,
            modes=["walk", "wheelchair", "vehicle"],
            flood_threshold_m=0.20,
            has_stairs=False,
            is_open=True,
            capacity=300,
        ),
        RoadEdge(
            id="E2",
            from_node="N2",
            to_node="N3",
            length_m=600.0,
            baseline_speed_kmh=36.0,
            modes=["walk", "wheelchair", "vehicle"],
            flood_threshold_m=0.25,
            has_stairs=False,
            is_open=True,
            capacity=500,
        ),
        RoadEdge(
            id="E3",
            from_node="N1",
            to_node="N4",
            length_m=400.0,
            baseline_speed_kmh=5.0,
            modes=["walk", "wheelchair"],
            flood_threshold_m=0.15,
            has_stairs=True,
            is_open=True,
            capacity=100,
        ),
        RoadEdge(
            id="E4",
            from_node="N4",
            to_node="N3",
            length_m=450.0,
            baseline_speed_kmh=5.0,
            modes=["walk"],  # vehicle and wheelchair not permitted
            flood_threshold_m=0.30,
            has_stairs=False,
            is_open=True,
            capacity=100,
        ),
    ]
    return nodes, edges


def test_haversine_distance():
    # Distance between Gateway of India (approx 72.8347, 18.9220) and Nariman Point (approx 72.8210, 18.9260)
    dist = haversine_distance(72.8347, 18.9220, 72.8210, 18.9260)
    assert 1400 < dist < 1600
    # Zero distance for identical coords
    assert haversine_distance(72.5, 19.0, 72.5, 19.0) == 0.0
    # Class static method should match
    assert RoadGraph.haversine_distance(72.8347, 18.9220, 72.8210, 18.9260) == dist


def test_load_network_and_travel_time():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    assert len(graph.nodes_dict) == 4
    assert len(graph.edges_dict) == 4
    assert graph.graph.number_of_nodes() == 4
    assert graph.graph.number_of_edges() == 4

    # Baseline travel time for E1:
    # length_m = 500m, baseline_speed_kmh = 18 km/h = 5 m/s
    # travel_time_s = 500 / 5 = 100.0s
    # Formula: (length_m / 1000.0) / (baseline_speed_kmh / 3600.0) = (0.5) / (0.005) = 100.0s
    e1 = graph.get_edge("E1")
    assert e1 is not None
    assert pytest.approx(e1["travel_time_s"], rel=1e-3) == 100.0
    assert pytest.approx(e1["baseline_travel_time_s"], rel=1e-3) == 100.0

    # Test baseline travel time for E2:
    # length_m = 600m, baseline_speed_kmh = 36 km/h = 10 m/s -> travel_time = 60s
    e2 = graph.get_edge("E2")
    assert pytest.approx(e2["travel_time_s"], rel=1e-3) == 60.0


def test_edge_dict_attribute_and_item_access():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    edge = graph.get_edge("E1")
    assert isinstance(edge, dict)
    # Check item access
    assert edge["id"] == "E1"
    assert edge["from_node"] == "N1"
    assert edge["to_node"] == "N2"
    assert edge["capacity"] == 300
    # Check attribute access
    assert edge.id == "E1"
    assert edge.capacity == 300
    assert edge.length_m == 500.0

    # Non-existent edge
    assert graph.get_edge("NON_EXISTENT") is None


def test_get_edge_between():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    edge_uv = graph.get_edge_between("N1", "N2")
    assert edge_uv is not None
    assert edge_uv["id"] == "E1"
    assert edge_uv.capacity == 300

    # Reverse direction should not exist in DiGraph
    assert graph.get_edge_between("N2", "N1") is None


def test_update_edge_state():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    # 1. Update closure
    graph.update_edge_state("E1", is_open=False)
    e1 = graph.get_edge("E1")
    assert e1["is_open"] is False
    assert e1["status"] == "closed"

    # 2. Re-open and set minor flood depth
    graph.update_edge_state("E1", is_open=True, flood_depth_m=0.08)
    e1 = graph.get_edge("E1")
    assert e1["is_open"] is True
    assert e1["status"] == "caution"

    # 3. Severe flood above flood_threshold_m (0.20)
    graph.update_edge_state("E1", flood_depth_m=0.25)
    e1 = graph.get_edge("E1")
    assert e1["status"] == "closed"

    # 4. Congestion ratio update and BPR travel time adjustment
    graph.update_edge_state("E2", congestion_ratio=1.5)
    e2 = graph.get_edge("E2")
    assert e2["congestion_ratio"] == 1.5
    # Baseline was 60.0s, with congestion 1.5, travel_time_s > 60.0s
    assert e2["travel_time_s"] > 60.0

    # 5. Explicit status and travel_time_s overrides
    graph.update_edge_state("E2", status="caution", travel_time_s=150.0)
    e2 = graph.get_edge("E2")
    assert e2["status"] == "caution"
    assert e2["travel_time_s"] == 150.0


def test_find_nearest_node():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    # Exact coordinate of N1
    nearest = graph.find_nearest_node(72.8258, 18.9256)
    assert nearest == "N1"

    # Slightly offset from N3 (lon=72.8318, lat=18.9316)
    nearest_shelter = graph.find_nearest_node(72.8319, 18.9317)
    assert nearest_shelter == "N3"

    # Empty graph
    empty_graph = RoadGraph()
    assert empty_graph.find_nearest_node(0.0, 0.0) is None


def test_get_traversable_subgraph():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    # Default mode 'walk' should have all 4 edges traversable initially
    sub_walk = graph.get_traversable_subgraph(mode="walk")
    assert sub_walk.number_of_nodes() == 4
    assert sub_walk.number_of_edges() == 4

    # Mode 'wheelchair': E3 has stairs, so E3 should be excluded!
    sub_wheelchair = graph.get_traversable_subgraph(mode="wheelchair")
    assert sub_wheelchair.number_of_nodes() == 4
    assert not sub_wheelchair.has_edge("N1", "N4")  # E3 has stairs
    assert sub_wheelchair.has_edge("N1", "N2")

    # Mode 'vehicle': E4 only allows ['walk'], so E4 must be excluded
    sub_vehicle = graph.get_traversable_subgraph(mode="vehicle")
    assert not sub_vehicle.has_edge("N4", "N3")

    # Now close E1
    graph.update_edge_state("E1", is_open=False)
    sub_closed = graph.get_traversable_subgraph(mode="walk")
    assert not sub_closed.has_edge("N1", "N2")

    # Re-open E1 and flood it beyond threshold
    graph.update_edge_state("E1", is_open=True, flood_depth_m=0.25)
    sub_flooded = graph.get_traversable_subgraph(mode="walk")
    assert not sub_flooded.has_edge("N1", "N2")

    # Check path connectivity
    assert not nx.has_path(sub_flooded, "N1", "N2")


def test_to_geojson():
    nodes, edges = sample_network()
    graph = RoadGraph()
    graph.load_network(nodes, edges)

    # Update states: E1 normal, E2 caution, E3 closed
    graph.update_edge_state("E1", is_open=True, flood_depth_m=0.0)
    graph.update_edge_state("E2", is_open=True, flood_depth_m=0.10)  # caution
    graph.update_edge_state("E3", is_open=False)                     # closed

    geojson = graph.to_geojson()
    assert geojson["type"] == "FeatureCollection"
    features = geojson["features"]
    assert len(features) == 8  # 4 nodes + 4 edges

    node_features = [f for f in features if f["properties"].get("type") == "node"]
    edge_features = [f for f in features if f["properties"].get("type") == "edge"]

    assert len(node_features) == 4
    assert len(edge_features) == 4

    e1_feat = next(f for f in edge_features if f["id"] == "E1")
    assert e1_feat["properties"]["status"] == "normal"
    assert e1_feat["properties"]["color"] == "green"

    e2_feat = next(f for f in edge_features if f["id"] == "E2")
    assert e2_feat["properties"]["status"] == "caution"
    assert e2_feat["properties"]["color"] == "amber"

    e3_feat = next(f for f in edge_features if f["id"] == "E3")
    assert e3_feat["properties"]["status"] == "closed"
    assert e3_feat["properties"]["color"] == "red"

    # Verify geometries are valid LineStrings with coordinates
    for ef in edge_features:
        assert ef["geometry"]["type"] == "LineString"
        assert len(ef["geometry"]["coordinates"]) >= 2

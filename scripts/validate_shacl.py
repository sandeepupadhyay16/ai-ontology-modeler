import sys
import json
import os
try:
    from export_rdf import serialize_w3c_ontology
except ImportError:
    from scripts.export_rdf import serialize_w3c_ontology
from rdflib import Graph
import pyshacl

def run_shacl_validation(data):
    # 1. Serialize ontology to Turtle string
    ttl_str = serialize_w3c_ontology(data, fmt='turtle')

    data_graph = Graph()
    data_graph.parse(data=ttl_str, format='turtle')

    # 2. Execute PySHACL validation
    conforms, report_graph, report_text = pyshacl.validate(
        data_graph,
        shacl_graph=None,
        ont_graph=None,
        inference='rdfs',
        abort_on_first=False,
        meta_shacl=False,
        debug=False
    )

    return {
        "conforms": conforms,
        "report": report_text,
        "conceptCount": len(data.get("concepts", [])),
        "relationshipCount": len(data.get("relationships", []))
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No JSON file provided"}))
        sys.exit(1)

    json_path = sys.argv[1]

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        res = run_shacl_validation(data)
        print(json.dumps(res))
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)

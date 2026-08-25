import requests

resp = requests.post(
    "http://localhost:8094/chat",
    json={"question": "What is the civil law procedure in Lithuania?"}
)

print(resp.json()["answer"])

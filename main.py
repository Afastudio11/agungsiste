import requests
from flask import Flask, Response, request

app = Flask(__name__)

UPSTREAM = "http://127.0.0.1:5173"
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "content-encoding",
}


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
def proxy(path):
    url = f"{UPSTREAM}/{path}"
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}

    try:
        upstream = requests.request(
            method=request.method,
            url=url,
            headers=fwd_headers,
            params=request.args,
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False,
            stream=True,
            timeout=60,
        )
    except requests.exceptions.ConnectionError:
        return Response("Dashboard (vite) not reachable on port 5173", status=502)

    resp_headers = [(k, v) for k, v in upstream.raw.headers.items() if k.lower() not in HOP_BY_HOP]
    return Response(upstream.iter_content(chunk_size=8192), status=upstream.status_code, headers=resp_headers)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

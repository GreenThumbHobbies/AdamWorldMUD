import urllib.request, base64, json

# ── Adams World / Adams Tavern Adventures ──────────────────────────
# Repo: https://github.com/GreenThumbHobbies/Adams-Tavern-Adventures.git
# Push ONLY when ready — test locally first!
# ──────────────────────────────────────────────────────────────────
TOKEN = "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"
REPO  = "GreenThumbHobbies/Adams-Tavern-Adventures"
API   = "https://api.github.com"
BASE  = r"C:\Users\green\OneDrive\Documents\Adams World MUD"

def get_sha(path):
    url = "{}/repos/{}/contents/{}".format(API, REPO, path)
    req = urllib.request.Request(url, headers={"Authorization":"token {}".format(TOKEN),"User-Agent":"pusher"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["sha"]
    except Exception as e:
        print("ERROR getting SHA for {} — repo may not exist yet or file is new: {}".format(path, e))
        return None

def push_file(path, local_path, msg):
    sha = get_sha(path)
    with open(local_path,"rb") as f:
        content = base64.b64encode(f.read()).decode()
    body = {"message":msg,"content":content}
    if sha: body["sha"] = sha
    data = json.dumps(body).encode()
    url = "{}/repos/{}/contents/{}".format(API, REPO, path)
    req = urllib.request.Request(url, data=data, method="PUT",
          headers={"Authorization":"token {}".format(TOKEN),"Content-Type":"application/json","User-Agent":"pusher"})
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
        commit_sha = res["commit"]["sha"][:8]
        print("Pushed {} -> {}".format(path, commit_sha))

push_file("server.js",          BASE + r"\server.js",           "Fix: joined enemies keep combat after DoT/companion kill; wider map depth")
push_file("public/client.html", BASE + r"\public\client.html",  "Update visual client")
print("Done!")

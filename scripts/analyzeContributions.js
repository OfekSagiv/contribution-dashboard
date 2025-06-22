
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const CONFIG = JSON.parse(fs.readFileSync("repos.json", "utf-8"));
const GH_TOKEN = process.env.GITHUB_TOKEN;
if (!GH_TOKEN) {
  console.error("❌ GITHUB_TOKEN not found. Did you set it in the workflow?");
  process.exit(1);
}
const AUTHOR = CONFIG.user;

function fetchReposFromUser(username) {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/users/${username}/repos?per_page=100`,
      method: "GET",
      headers: {
        "User-Agent": "GitHub-Stats",
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });

    req.on("error", (e) => {
      console.error(e);
      resolve([]);
    });

    req.end();
  });
}

function runGitLog(repoName, repoUrl) {
  try {
    const cloneDir = path.join(__dirname, "../tmp");
    execSync(`rm -rf ${cloneDir}`);
    execSync(`git clone --depth=100 ${repoUrl} ${cloneDir}`, { stdio: "ignore" });

    const output = execSync(
      `cd ${cloneDir} && git log --author="${AUTHOR}" --pretty=tformat: --numstat | grep -E "\\.(js|jsx|ts|tsx|java)$" | awk '{a+=$1; d+=$2} END {printf "%d,%d", a, d}'`
    )
      .toString()
      .trim();

    const [added, deleted] = output.split(",").map(Number);
    return { repo: repoName, added, deleted };
  } catch {
    return { repo: repoName, added: 0, deleted: 0 };
  }
}

(async () => {
  const repos = [];
  const userRepos = await fetchReposFromUser(CONFIG.user);
  userRepos.forEach((repo) =>
    repos.push({ repo: repo.name, owner: repo.owner.login, url: repo.clone_url })
  );
  CONFIG.additionalRepos.forEach(({ owner, repo }) =>
    repos.push({ repo, owner, url: `https://github.com/${owner}/${repo}.git` })
  );

  const results = [];
  for (const { repo, url } of repos) {
    const stats = runGitLog(repo, url);
    results.push(stats);
  }

  fs.writeFileSync("contributions.json", JSON.stringify(results, null, 2));
})();

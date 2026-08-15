---
name: shipping
description: Ship the current work end-to-end — gate, commit, build & push the image, deploy, report. Use when the user asks to ship or deploy the current changes to staging. For versioned releases (git tag → Docker Hub → production), use the release skill instead.
---

Ship the current work in one pass: gate → commit → build & push → deploy → report.

1. **Gate.** `prek run --all-files` from the repo root — the same hooks CI runs. Any failure: stop, fix, re-run until green.
2. **Commit.** Delegate to the commit skill.
3. **Build & push.** `python3 docker/build.py --push` — builds the rolling `main` tag and pushes it to the private registry (192.168.5.50:5000). `--all-platforms` only when the user asks for multi-arch.
4. **Deploy.** Staging is the default (`ansible-playbook devops/ansible/deploy.yml`); another environment only if the user names it. Production (`-e target=production`) deploys the pinned Docker Hub version tag, so it needs a versioned release first (release skill). The playbook's post-deploy health check owns verification — do not re-verify by hand.
5. **Report.** Image reference, environment, health-check outcome — one line.

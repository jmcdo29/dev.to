---
published: true
title: 'Automating your package deployment in an Nx Monorepo with Changeset'
description: 'Another article about monorepo package deployment, but this time with pnpm, nx, and changeset'
tags: nx, pnpm, automation, changeset
---

All right, all right. I know, another monorepo package deployment post. But this was a pattern I didn't have luck finding with my Google Fu, and I figure that others may be interested in how to make [an Nx workspace](https://nx.dev) work with the [changesets](https://github.com/atlassian/changesets) package.

If you haven't heard of Nx, it's a monorepo build framework that helps keep your build, test, and run scripts ini the same format while having different actions, along with being smart enough to determine what has and hasn't been affected since your last changes.

Changesets on the other hand is a semver version management tool that integrates well with pnpm and yarn workspaces by looking at the workspace file and walking you through a wizard for setting up which packages have changed (and has a great [GitHub Actions integration](https://github.com/changesets/action) and [bot for previewing which packages will be updated and how](https://github.com/apps/changeset-bot)).

Now that these are defined, onto the meat of those post.

## So what's the problem?

I migrated from using a [pnpm workspace](https://pnpm.io/workspaces) to using Nx with pnpm workspaces so that I could take advantage of running all of my commands through Nx and get some sweet caching of my commands and familiarity between all of the commands. So now instead of having to try to remember "Is it `pnpm -r build`?" and the "How do I filter to only some of the projects again?", I only have to remember `pnpm nx build <project>` or `pnpm nx --run-many build --all`. I promise, these commands start rolling off your fingers as you keep using them.

Now, with my pnpm workspace, every package was built in a `dist` directory right next to the `src` so I'd have `packages/<package>/src` and `packages/<package>/dist` and I could easily keep a `package.json` per package and have it deploy from right there. With Nx, that's not really the case anymore. There's a root `package.json` that holds all of the dependencies and _most_ of the time, the `outDir` is set to be `<workspaceRoot>/dist/<package>/src`. Kind of makes deploying from a central location just a bit harder.

For the `build` command with Nx, I'm actually using the [`@nrwl/node:package`](https://nx.dev/l/n/node/package) executor, which runs a build command via `tsc` and copies over the `package.json` (if you have one), and sets it up with the proper path for publishing, and copies the package's `README` and `CHANGELOG` if they exist. If you don't have a `package.json` for the library, Nx will create one for you and populate it with the `dependencies` it finds in the compiled code. You can set the `outputPath` to anything you want, but I've found that `dist/<package>` works really well for this automation setup. You could actually do `packages/<package>`, but then your `ts` and your `js` will get mixed with each other, which I find very messy and confusing.

So now why is having these packages in the `dist/` directory a problem? Well, because `changesets` works by reading the workspace's configuration, and as we want to have our source code version tracked, but not the compiled code, we don't normally include the `dist` in our git repository. Because of this, when we do things like `pnpm changeset` to create a new changeset, we'll eventually be modifying the `package.json` in the `packages/<package>/` directory.

The changeset action that I mentioned earlier works like this during your CI workflow:

1. check if there's one or more changeset file(s)
   1. if yes, open a PR with the updates to the appropriate `package.json`s (in the `packages/<package>` directories)
   2. if no, check that the packages in the workspace configuration are all up to date
      1. if no, run the publish action to update npm with the most recent package version

> Something to note is that when the `package.json` for a specific package, that package will then be picked up by `nx affected` meaning that you can only build the packages that will be published in CI if you feel up to going that route.

So a typical workflow would look something like

1. git pull
2. git checkout -b <feature-branch>
3. make changes
4. commit changes as often as you normally would
5. pnpm changeset
6. follow the changeset wizard and set up the changes to be made
7. git add .
8. git commit
9. git push origin <feature-branch>
10. merge PR
11. let the changeset action make a new version PR
12. review and merge
13. let changeset publish

The final problem occurs in this "let changeset publish" step, and the solution is coming up.

## Modifying the workspace file only in CI

So after playing with ideas of using different tools, manual workflows, I finally came to a solution that works well using some bash scripting in CI. For me, my `pnpm-workspace.yaml` file usually looks something like

```yaml
packages:
  - 'packages/**
```

and I realized that with the [`sed`](https://www.gnu.org/software/sed/manual/sed.html) tool I would be able to change that `packages/**` to `dist/**` only during CI so that the `changeset publish` command would look in the correct directory for the packages I want to publish. So now the actions file looks something like this:

```yaml
name: Release

on:
  push:
    branches:
      - main

env:
  NX_BRANCH: ${{ github.event.pull_request.head.ref }}
  NX_RUN_GROUP: ${{ github.run_id }}
  NX_CLOUD_DISTRIBUTED_EXECUTION: true
  NX_CLOUD_AUTH_TOKEN: ${{ secrets.NX_CLOUD_TOKEN }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@master
        with:
          # This makes Actions fetch all Git history so that Changesets can generate changelogs with the correct commits
          fetch-depth: 0
      - name: Derive appropriate SHAs for base and head for `nx affected` commands
        uses: nrwl/nx-set-shas@v1

      - name: Setup Node.js 14.x
        uses: actions/setup-node@master
        with:
          node-version: 14.x

      - name: Install pnpm
        run: npm i -g pnpm

      - name: Install Dependencies
        run: pnpm i --frozen-lockfile=false

      - name: Build Projects
        run: pnpm build

      - name: Modify Workspace File
        run: sed -e "s|'packages\/|'dist/|" pnpm-workspace.yaml > pnpm-new.yaml && mv pnpm-new.yaml pnpm-workspace.yaml

      - name: Create Release Pull Request or Publish to npm
        id: changesets
        uses: changesets/action@master
        with:
          # This expects you to have a script called release which does a build for your packages and calls changeset publish
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Stop Nx Cloud Agents
        run: pnpx -y nx-cloud stop-all-agents

  nx_agent:
    runs-on: ubuntu-latest
    name: Nx Agent
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: 14.x
      - name: Install pnpm
        run: npm i -g pnpm

      - name: Install Dependencies
        run: pnpm i --frozen-lockfile=false
      - run: pnpx nx-cloud start-agent
```

Normally, I'd use the `-i` option for `sed`, to write in place, but that's not an option on GitHub Action Runners, so writing to a temp file and overwriting the original file works instead.

So now, what's happening is that when a PR is made with a changeset (or multiple changesets) a second PR will be automatically opened by the changeset action to update bump the package versions **and** generate the CHANGELOG files based on the changesets being merged in. Then, when that PR gets merged, Nx will see what packages have been modified, build them to the `dist/<package>` directory, copying over the `package.json`, `README`, and `CHANGELOG`. Now our custom `sed` script will rewrite the `pnpm-workspace.yml` so that we point `changesets` to the correct directory for the to-be-published packages. Changesets will then see what packages are there, what is public, and what has mismatched versions compared to what's on the npm registry, and publish whatever is missing so that it's all up to date. Also, a GitHub release will be created during this too, so you have a tag and release pointing to the repo at that point in time.

Overall, I'm pretty excited to have this flow automated and working through three of my favorite package management tools. Everything will also work if you're using a `yarn` workspace instead, just change the `sed` script to modify the workspace file for yarn instead of the one for `pnpm`. If you're developing packages and using an Nx workspace and need automated package deployment, give this a shot.

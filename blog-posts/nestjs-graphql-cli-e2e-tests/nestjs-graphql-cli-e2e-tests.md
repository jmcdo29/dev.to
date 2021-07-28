---

published: true
title: "Using the NestJS CLI GraphQL Plugin for E2E Testing"
cover_image:
description:
tags: nestjs, graphql, testing, jest, cli, plugin, e2e
series:
canonical_url:

---

_Jay is a member of the NestJS core team, primarily helping out the community on Discord and Github and contributing to various parts of the framework._

If you've been using [NestJS](https://docs.nestjs.com) for GraphQL, you probably know about the sweet `@nestjs/cli` plugin to auto-annotate all of your DTOs with GraphQL metadata, meaning you can cut down on code and make your development cycle faster (and let's be honest, who doesn't want that?). So you've written your code, using that awesome plugin, your unit tests are passing, you fire up your e2e tests and everything fails. GraphQL errors left and right about missing metadata, jest complaining about failures, and everything right in the world is now all so very wrong. Why did this happen, and how can we fix it?

## Why did this happen?

To understand the why of this, we need to figure out what all Nest's `build` command does and how it works from a very high level. Below is a short list of what the `build` command is responsible for

- compile code from ts to js
- map paths properly for us (if using path aliases)
- annotate DTOs with swagger decorators (if applied)
- annotates DTOs with GraphQL decorators (if applied)
- set up an automatic watcher to recompile on change (if using `start --watch`)

Now all of this looks really sweet compared to the standard Typescript compiler. In fact, Nest uses the Typescript compiler under the hood by default (though this can be swapped out for Webpack if you choose to do so). What's important to note here though, is that this is **more** than what `tsc` does by default. And because of all this, when we try to run our e2e tests through [`ts-jest`](https://github.com/kulshekhar/ts-jest), the default `tsc` compiler just isn't enough.

## Okay, so how do I fix it?

The way I see it, there's two main options:

1. Create a `ts-jest` compiler plugin that can be swapped out with `typescript`
2. Create a process for building your test files specifically for e2e testing

While the first option sounds great, there's a couple of problems with it. It's specific to `ts-jest` so if anyone wanted to use something like `mocha` a whole new plugin would need to be written, and it's difficult to write, because Nest's build command is a wrap around of `tsc`, not an entirely new compiler in the first place.

So we go with option two and write a build process for e2e tests.

### The Build Process

The first thing that we will need now is a new `tsconfig`, so that we can get the build to include both our source code and our test code. So, taking the standard setup from a `nest new` project, we can make a `tsconfig.test.json` that looks like this

```js
// src/tsconfig.test.json

{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist-test"
  },
  "include": ["src", "test"]
}

```

This will test `nest build` to include both the `src` directory and the `test` dir, and use a different output directory than our normal build process.

> hint: you should probably add the `dist-test` dir to your `.gitignore` so it isn't checked into version control

Now we need to update our `jest-e2e.json` that Nest provides for us. We need to remove the `transform` property, and change the regex used for finding the tests. The new `jest-e2e.json` should look something like this:

```js
// src/jest-e2e.json

{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.js$"
}

```

Now the last thing to do is to create a build script and a test script to build the entire source code with tests and move them all to a single directory for tests. We can make use of `pre` scripts here and make two new scripts in the `package.json` that look like this

```js
// src/scripts.txt

"pretest:e0e": "nest build -p tsconfig.test.json && cp ./test/jest-e2e.json ./dist-test/test/",
"test:e0e": "jest --config ./dist-test/test/jest-e2e.json"

```

With these commands, when we run `npm run test:e2e` or `yarn test:e2e`, we are telling nest to build the project using the new `tsconfig.test.json` we created, move the `jest-e2e.json` to the `./dist-test/test/` directory, to act similarly to where it already lives in the `./test/` dir (Typescript won't move non ts files by default), and then for `jest` (not `ts-jest`) to run the tests based on the config file.

To see a running version of this [you can view my sample repository here](https://github.com/jmcdo29/nestjs-graphql-e2e-plugin).

If you have questions or comments let me know. And if you want to discuss more about NestJS in general [feel free to check out our Discord](https://discord.gg/nestjs).

---
title: Setting Up Sessions with NestJS, Passport, and Redis
published: false
tags: nestjs, passport, sessions, authentication, redis
description: An article to discuss how to set up NestJS sessions using Passport and Redis
---

_Jay is a member of the NestJS core team, primarily helping out the community on Discord and Github and contributing to various parts of the framework._

If you're here, you're either one of the avid readers of my, just stumbling about dev.to looking for something interesting to read, or you're searching for how to implement sessions with [Passport](http://www.passportjs.org/) and [NestJS](https://docs.nestjs.com/). [Nest's own docs](https://docs.nestjs.com/security/authentication) do a pretty good job of showing how to set up the use of [JWTs](https://jwt.io) with Passport, but are lacking when it comes to how to use sessions. Maybe you want to use a session store because of supporting some legacy software. Maybe it's because JWTs bring too much complexity with scope. Maybe it's because you're looking for an easier way to set up refresh tokens. Whatever the case, this article is going to be for you.

## Pre-requisites

I'm going to be using NestJS (it's in the title, so I hope that's obvious) and I'm going to be making use of [Guards](https://docs.nestjs.com/guards) so if you don't know what those are, I highly suggest reading up on them first. Don't worry, I'll wait.

I'm also going to be not using an HTTP client like [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/), but using [`cURL`](https://curl.se/) instead. I lke living in the terminal as much as I can, as it gives me immediate feedback between my terminals. Feel free to use whichever you prefer, but the code snippets will be curls.

And speaking of immediate feedback, I'm also going to be using [`tmux`](https://github.com/tmux/tmux), which is a terminal multiplexer, to allow me to run multiple terminals at a time within the same window and logical grouping. This allows me to keep a single terminal window up and view my server logs, docker-compose instance and/or logs, and make curls without having to alt-tab to change views. Very handy, and very customizable.

Lastly, I'll be using [`docker`](https://docs.docker.com/) and a [`docker-compose file`](https://docs.docker.com/compose/compose-file/compose-file-v3/) to run a [Redis](https://redis.com/) instance for the session storage and to allow for running a redis-cli to be able to query the redis instance ran by Docker.

All of the code will be available [to follow along with and run here](). Just note that to run it after you clone and run the install for the repo, you'll need to `cd blog-posts/nestjs-passport-sessions` and then run `nest start --watch` yourself. Just a side effect of how the repo is set up for my dev.to blogs.

### Following along from scratch

> If you're following along with the code that's pre-built, feel free to skip over this.

To set up a similar project from scratch, you'll need to first set up a Nest project, which is easiest through the Nest CLI

```sh
nest new session-authentication
```

Choose your package manager of choice, and then install the follow dependencies

```sh
pnpm i @nestjs/passport passport passport-local express-session redis connect-redis bcrypt
```

And the following peer dependencies

```sh
pnpm i -D @types/passport-local @types/express-session @types/connect-redis @types/bcrypt @types/redis
```

> npm and yarn work fine as well, I just like pnpm as a package manager

Now you should be okay to follow along with the rest of the code, building as we go.

## NestJS and Passport

### The AuthGuard()

Like most `@nestjs/` packages, the `@nestjs/passport` package is _mostly_ a thin wrapper around passport, but Nest does do some cool things with the passport package that I think are worth mentioning. First, the [`AuthGuard` mixin](https://github.com/nestjs/passport/blob/master/lib/auth.guard.ts). At first glance, this mixin may look a little intimidating, but let's take it chunk by chunk.

```ts
export const AuthGuard: (type?: string | string[]) => Type<IAuthGuard> = memoize(createAuthGuard);
```

Ignoring the `memoize` call, this `createAuthGuard` is where the magic of class creation happens. We end up passing the `type`, if applicable, to the `createAuthGuard` method and will eventually pass that back to the `@UseGuards()`. Everything from here on, unless mentioned otherwise, will be a part of the `createAuthGuard` method.

```ts
class MixinAuthGuard<TUser = any> implements CanActivate {
  constructor(@Optional() protected readonly options?: AuthModuleOptions) {
    this.options = this.options || {};
    if (!type && !this.options.defaultStrategy) {
      new Logger('AuthGuard').error(NO_STRATEGY_ERROR);
    }
  }
...
```

The constructor allows for an optional injection of `AuthModuleOptions`. This is what is passed to `PassportModule.register()`. This just allows Nest to figure out if the `defaultStrategy` is used or the named one passed to `AuthGuard`.

```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = {
      ...defaultOptions,
      ...this.options,
      ...await this.getAuthenticateOptions(context)
    };
    const [request, response] = [
      this.getRequest(context),
      this.getResponse(context)
    ];
    const passportFn = createPassportContext(request, response);
    const user = await passportFn(
      type || this.options.defaultStrategy,
      options,
      (err, user, info, status) =>
        this.handleRequest(err, user, info, context, status)
    );
    request[options.property || defaultOptions.property] = user;
    return true;
  }
```

This here reads through decently well, we have custom methods for getting the authentication options (defaults to returning `undefined`), getting the `request` and `response` objects (defaults to `context.switchToHttp().getRequest()/getResponse()`), and then this `createPassportContext` method that is called and then it's return is immediately called with the strategy name and options. Then, we set `req.user` to the return of `passportFn` and return `true` to let the request continue. The next code block is not a part of the mixin or `MixinAuthGuard` class.

```ts
const createPassportContext = (request, response) => (type, options, callback: Function) =>
  new Promise<void>((resolve, reject) =>
    passport.authenticate(type, options, (err, user, info, status) => {
      try {
        request.authInfo = info;
        return resolve(callback(err, user, info, status));
      } catch (err) {
        reject(err);
      }
    })(request, response, err => (err ? reject(err) : resolve())),
  );
```

Here's where some magic may be seen to happen: Nest ends up calling `passport.authenticate` for us, so that we don't have to call it ourselves. In doing so, it wraps passport in a promise, so that we can manage the callback properly, and provides it's own handler to the `authenticate` function. This entire method is actually creating a different callback function so that we can end up calling `this.handleRequest` with the `err`, `user`, `info`, and `status` returned by passport. This can take a bit of time to understand, and isn't necessarily needed, but it's usually good to know what _some_ of the code under the hood is doing.

```ts
  handleRequest(err, user, info, context, status): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
```

This is pretty straightforward, but it's useful to know this method is here. [As mentioned in Nest's docs](https://docs.nestjs.com/security/authentication#extending-guards) if you need to do any debugging about why the request is failing, here is a good place to do it. Generally just adding the line `console.log({ err, user, info, context, status })` is enough, and will help you figure out pretty much anything going wrong within the passport part of the request.

There's two other classes I want to talk about before getting to the implementation, but I promise it'll be worth it!

### The PassportStrategy()

So the next mixin we have to look at is the [`PassportStrategy`](https://github.com/nestjs/passport/blob/master/lib/passport/passport.strategy.ts) mixin. This is how we end up actually registering our strategy class's `validate` method to passport's `verify` callback. This mixin does a little bit more in terms of some advance JS techniques, so again, lets take this chunk by chunk.

```ts
export function PassportStrategy<T extends Type<any> = any>(
  Strategy: T,
  name?: string | undefined
): {
  new (...args): InstanceType<T>;
} {
  abstract class MixinStrategy extends Strategy {
```

This part is pretty straightforward, we're just passing the passport strategy class and an optional renaming of the strategy to the mixin.

```ts
constructor(...args: any[]) {
  const callback = async (...params: any[]) => {
    const done = params[params.length - 1];
    try {
      const validateResult = await this.validate(...params);
      if (Array.isArray(validateResult)) {
        done(null, ...validateResult);
      } else {
        done(null, validateResult);
      }
    } catch (err) {
      done(err, null);
    }
  };
```

This is the first half of the constructor. You'll probably notice right of the bat that we don;'t call `super`, at least not yet. This is because we're setting up the callback to be passed to passport later. So what's happening here is we're setting up a function that's going to be calling `this.validate` and getting the result from it. If that result happens to be an array, we spread the array (passport will use the first value), otherwise we'll end up calling the `done` callback with just the result. If there happens to be an error, in good ole callback style, it'll be passed as the first value to the `done` method.

```ts
  super(...args, callback);
  const passportInstance = this.getPassportInstance();
  if (name) {
    passportInstance.use(name, this as any);
  } else {
    passportInstance.use(this as any);
  }
}
```

_Now_ we end up calling `super`, and in doing so, we overwrite the original `verify` with the new callback we just created. This sets up the entire passport Strategy class that we're going to use for the strategy's name. Now all that's left to do is tell passport about it, by calling `passportInstance.use(this)` (or passing the custom name as the first argument).

If any of that went a little too deep, don't worry. It's something you can come back to if you really want, but isn't necessary for the rest of ths article.

### PassportSerializer

Finally, an actual class! This is the most straightforward and the last bit of passport I'll talk about before getting into the implementation of sessions. This class _usually_ won't be used in Nest applications \__unless_ you are using sessions, and we're about to see why.

So passport has the notion of serializing and deserializing a user. Serializing a user is just taking the user's information and compressing it/ making it as minimal as possible. In many cases, this is just using the `ID` of the user. Deserializing a user is the opposite, taking an ID and hydrating an entire user out of it. This usually means a call to a database, but it's not necessary if you don't want to worry about it. Now, Nest has a `PassportSerializer` class like so:

```ts
export abstract class PassportSerializer {
  abstract serializeUser(user: any, done: Function);
  abstract deserializeUser(payload: any, done: Function);

  constructor() {
    const passportInstance = this.getPassportInstance();
    passportInstance.serializeUser((user, done) => this.serializeUser(user, done));
    passportInstance.deserializeUser((payload, done) => this.deserializeUser(payload, done));
  }

  getPassportInstance() {
    return passport;
  }
}
```

You should only ever have one class extending the `PassportSerializer`, and what it should do is set up the general serialization and deserialization of the user for the session storage. The `user` passed to `serializeUser` is usually the same value as `req.user`, and the `payload` passed to `deserializeUser` is the value passed as the second parameter to the `done` of `serializeUser`. This will make a bit more sens when it is seen in code.

## Break Time

Okay, that was a lot of information about NestJS and Passport all at once, and some pretty complex code to go through. Take a break here if you need to. Get some coffee, stretch your legs, go play that mobile game you've been wanting to. Whatever you want to do, or continue on with the article if you want.

## Running Redis Locally

You can either install and run redis locally on your machine, or you can use a `docker-compose.yml` file to run redis inside a container. The following compose fle is what I used while working on this article

```yml
# docker-compose.yml
```

And then to run redis, I just used `docker compose up redis -d`. When I needed to run the redis CLI, I used `docker compose run rcli` to connect to the redis instance via the docker network.

## Setting Up the Middleware

Now on to the middleware we're going to be using: for setting up sessions and a way to store them, I'm going to be using [express-session](https://www.npmjs.com/package/express-session), and [connect-redis](https://www.npmjs.com/package/connect-redis) for the session and session store, and [redis](https://www.npmjs.com/package/redis) as the redis client for connect-redis. I'm also going to be setting up our middleware via a [Nest middleware](https://docs.nestjs.com/middleware) instead of using `app.use` in the `bootstrap` so that when we do e2e testing, the middleware is already set up (that's out of the scope of this article). I've also got redis set up as a [custom provider]() using the following code

```ts
// src/redis/redis.module.ts
```

```ts
// src/redis/redis.constants.ts
```

which allows for us to use `@Inject(REDIS)` to inject the redis client. Now we can configure our middleware like so:

```ts
// src/app.module.ts
```

and have passport ready to use sessions. There's two important things to note here:

1. `passport.initialize()` must be called before `passport.session()`.
2. `session()` must be called before `passport.initialize()`

With this now out of the way, let's move on to our auth module.

## The AuthModule

To start off, let's define our `User` as the following

```ts
// src/auth/models/user.interface.ts
```

And then have `RegisterUserDto` and `LoginUserDto` as

```ts
// src/auth/models/register-user.dto.ts
```

and

```ts
// src/auth/models/login-user.dto.ts
```

Now we'll set up our `LocalStrategy` as

```ts
// src/auth/local.strategy.ts
```

Notice here we're passing `usernameField: 'email'` to `super`. This is because in our `RegisterUserDto` and `LoginUserDto` we're using the `email` field and not `username` which is passport's default. You can change the `passwordField` too, but I had no reason to do that for this article. Now we'll make our `AuthService`,

```ts
// src/auth/auth.service.ts
```

our controller

```ts
// src/auth/auth.controller.ts
```

and our serializer

```ts
// src/serialization.provider.ts
```

along with our module

```ts
// src/auth/auth.module.ts
```

All we need to do for the `AuthSerializer` is to add it to the `providers` array. Nest will instantiate it, which will end up calling `passport.serializeUser` and `passport.deserializeUser` for us (told you going over that would be useful).

## The Guards

So now let's get to our guards, as you'll notice up in the `AuthController` we're not using `AuthGuard('local')`, but `LocalGuard`. The reason for this is because we need to end up calling `super.logIn(request)`, which the `AuthGuard` _has_, but doesn't make use of by default. This just ends up calling `request.login(user, (err) => done(err ? err : null, null))` for us, which is how the user serialization happens. This is what kicks off the session. I'll repeat that because it's **super important**. `super.logIn(request)` **is how the user gets a session**. To make use of this method, we can set up the `LocalGuard` as below

```ts
// src/local.guard.ts
```

We have another guard as well, the `LoggedInGuard`. This guards ends up just calling `request.isAuthenticated()` which is a method that passport ends up adding to the request object when sessions are in use. We can use this instead of having to have the user pass us the username and password every request, because there will be a cookie with the user's session id on it.

```ts
// src/logged-in.guard.ts
```

## A couple of extra classes

There's a few other classes that I'm making use of. It'll be easiest to view them in the GitHub repo, but I'll add them here if you just want to copy paste:

```ts
// src/app.controller.ts
```

```ts
// src/app.service.ts
```

```ts
// src/main.ts
```

## Testing out the flow

So now, we can run everything all together and test out the flow. First things first, make sure the Redis instance is running. Without that, the server won't start. Once it's running, run `nest start --watch` to start the server in dev mode which will recompile and restart on file change. Now it's time to send some `curl`s.

### Testing Existing Users

So let's start off with some existing user test. We'll try to log in as Joe Foo. 

```sh
curl http://localhost:3000/auth/login -d 'email=joefoo@test.com&password=Passw0rd!' -c cookie.joe.txt
```

If you aren't familiar with curl, the `-d` make the request a POST, and sends the data as `application/x-www-form-urlencoded` which Nest accepts by default. The `-c` tells curl that it should start the cookie engine and save the cookies to a file. If all goes well, you should get a response like 

```json
{"cookie":{"originalMaxAge":60000,"expires":"2021-08-16T05:30:51.621Z","httpOnly":false,"path":"/","sameSite":true},"passport":{"user":1}}
```

Now we can send a request to `/protected` and get our protected response back

```sh
curl http://localhost:3000/protected -b cookie.joe.txt
```

With `-b` we are telling curl to use the cookies found in this file. 

Now let's check the registration:

```sh
curl http://localhost:3000/auth/register -c cookie.new.txt -d 'email=new.email@test.com&password=password&confirmationPassword=password&firstName=New&lastName=Test'
```

You'll notice that no session was created for the new user, which means they still need to log in. Now let's send that login request

```sh
curl http://localhost:3000/auth/login -c cookie.new.txt -d 'email=new.email@test.com&password=password'
```

And check that we did indeed create a session

```sh
curl http://localhost:3000/protected -b cookie.new.txt`
```

And just like that, we've implemented a session login with NestJS, Redis, and Passport.

To view the session IDs in redis, you can connect the redis-cli to the running instance and run `KEYS *` to get all of the set keys. By default `connect-redis` uses `sess:` as a session key prefix. 

## Conclusion

Phew, okay, that was definitely a longer article than I had anticipated with a much deeper focus on Nest's integration with Passport, but hopefully it helps paint a picture of how everything ties together. With the above, it should be possible to integrate sessions with any kind of login, basic, local, OAuth2.0, so long as the user object remains the same.

One last thing to note, when using sessions, cookies are a must. The client must be able to work with cookies, otherwise the session will essentially be lost on each request.

If you have any questions, feel free to leave a comment or find me on the [NestJS Discord Server](https://discord.gg/nestjs)

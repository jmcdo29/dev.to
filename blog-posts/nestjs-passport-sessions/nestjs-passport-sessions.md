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

version: '3'
services:
  redis:
    image: redis:latest
    ports:
      - '6379:6379'
  rcli:
    image: redis:latest
    links:
      - redis
    command: redis-cli -h redis

```

And then to run redis, I just used `docker compose up redis -d`. When I needed to run the redis CLI, I used `docker compose run rcli` to connect to the redis instance via the docker network.

## Setting Up the Middleware

Now on to the middleware we're going to be using: for setting up sessions and a way to store them, I'm going to be using [express-session](https://www.npmjs.com/package/express-session), and [connect-redis](https://www.npmjs.com/package/connect-redis) for the session and session store, and [redis](https://www.npmjs.com/package/redis) as the redis client for connect-redis. I'm also going to be setting up our middleware via a [Nest middleware](https://docs.nestjs.com/middleware) instead of using `app.use` in the `bootstrap` so that when we do e2e testing, the middleware is already set up (that's out of the scope of this article). I've also got redis set up as a [custom provider]() using the following code

```ts
// src/redis/redis.module.ts

import { Module } from '@nestjs/common';
import * as Redis from 'redis';

import { REDIS } from './redis.constants';

@Module({
  providers: [
    {
      provide: REDIS,
      useValue: Redis.createClient({ port: 6379, host: 'localhost' }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}

```

```ts
// src/redis/redis.constants.ts

export const REDIS = Symbol('AUTH:REDIS');

```

which allows for us to use `@Inject(REDIS)` to inject the redis client. Now we can configure our middleware like so:

```ts
// src/app.module.ts

import { Inject, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import * as RedisStore from 'connect-redis';
import * as session from 'express-session';
import { session as passportSession, initialize as passportInitialize } from 'passport';
import { RedisClient } from 'redis';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth';
import { REDIS, RedisModule } from './redis';

@Module({
  imports: [AuthModule, RedisModule],
  providers: [AppService],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        session({
          store: new (RedisStore(session))({ client: this.redis, logErrors: true }),
          saveUninitialized: false,
          secret: 'sup3rs3cr3t',
          resave: false,
          cookie: {
            sameSite: true,
            httpOnly: false,
            maxAge: 60000,
          },
        }),
        passportInitialize(),
        passportSession(),
      )
      .forRoutes('*');
  }
}

```

and have passport ready to use sessions. There's two important things to note here:

1. `passport.initialize()` must be called before `passport.session()`.
2. `session()` must be called before `passport.initialize()`

With this now out of the way, let's move on to our auth module.

## The AuthModule

To start off, let's define our `User` as the following

```ts
// src/auth/models/user.interface.ts

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

```

And then have `RegisterUserDto` and `LoginUserDto` as

```ts
// src/auth/models/register-user.dto.ts

export class RegisterUserDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmationPassword: string;
}

```

and

```ts
// src/auth/models/login-user.dto.ts

export class LoginUserDto {
  email: string;
  password: string;
}

```

Now we'll set up our `LocalStrategy` as

```ts
// src/auth/local.strategy.ts

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email',
    });
  }

  async validate(email: string, password: string) {
    console.log('Validating in LocalStrategy');
    return this.authService.validateUser({ email, password });
  }
}

```

Notice here we're passing `usernameField: 'email'` to `super`. This is because in our `RegisterUserDto` and `LoginUserDto` we're using the `email` field and not `username` which is passport's default. You can change the `passwordField` too, but I had no reason to do that for this article. Now we'll make our `AuthService`,

```ts
// src/auth/auth.service.ts

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

import { LoginUserDto, RegisterUserDto } from './models';
import { User } from './models/user.interface';

@Injectable()
export class AuthService {
  private users: User[] = [
    {
      id: 1,
      firstName: 'Joe',
      lastName: 'Foo',
      email: 'joefoo@test.com',
      // Passw0rd!
      password: '$2b$12$s50omJrK/N3yCM6ynZYmNeen9WERDIVTncywePc75.Ul8.9PUk0LK',
    },
    {
      id: 2,
      firstName: 'Jen',
      lastName: 'Bar',
      email: 'jenbar@test.com',
      // P4ssword!
      password: '$2b$12$FHUV7sHexgNoBbP8HsD4Su/CeiWbuX/JCo8l2nlY1yCo2LcR3SjmC',
    },
  ];

  async validateUser(user: LoginUserDto) {
    const foundUser = this.users.find(u => u.email === user.email);
    if (!user || !(await compare(user.password, foundUser.password))) {
      throw new UnauthorizedException('Incorrect username or password');
    }
    const { password: _password, ...retUser } = foundUser;
    return retUser;
  }

  async registerUser(user: RegisterUserDto): Promise<Omit<User, 'password'>> {
    const existingUser = this.users.find(u => u.email === user.email);
    if (existingUser) {
      throw new BadRequestException('User remail must be unique');
    }
    if (user.password !== user.confirmationPassword) {
      throw new BadRequestException('Password and Confirmation Password must match');
    }
    const { confirmationPassword: _, ...newUser } = user;
    this.users.push({
      ...newUser,
      password: await hash(user.password, 12),
      id: this.users.length + 1,
    });
    return {
      id: this.users.length + 1,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    };
  }

  findById(id: number): Omit<User, 'password'> {
    const { password: _, ...user } = this.users.find(u => u.id === id);
    if (!user) {
      throw new BadRequestException(`No user found with id ${id}`);
    }
    return user;
  }
}

```

our controller

```ts
// src/auth/auth.controller.ts

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { LocalGuard } from '../local.guard';
import { AuthService } from './auth.service';
import { LoginUserDto, RegisterUserDto } from './models';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  registerUser(@Body() user: RegisterUserDto) {
    return this.authService.registerUser(user);
  }

  @UseGuards(LocalGuard)
  @Post('login')
  loginUser(@Req() req, @Body() user: LoginUserDto) {
    return req.session;
  }
}

```

and our serializer

```ts
// src/auth/serialization.provider.ts

import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { User } from './models/user.interface';

@Injectable()
export class AuthSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }
  serializeUser(user: User, done: (err: Error, id: number) => void) {
    done(null, user.id);
  }

  deserializeUser(payload: number, done: (err: Error, user: Omit<User, 'password'>) => void) {
    const user = this.authService.findById(payload);
    done(null, user);
  }
}

```

along with our module

```ts
// src/auth/auth.module.ts

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { AuthSerializer } from './serialization.provider';

@Module({
  imports: [
    PassportModule.register({
      session: true,
    }),
  ],
  providers: [AuthService, LocalStrategy, AuthSerializer],
  controllers: [AuthController],
})
export class AuthModule {}

```

All we need to do for the `AuthSerializer` is to add it to the `providers` array. Nest will instantiate it, which will end up calling `passport.serializeUser` and `passport.deserializeUser` for us (told you going over that would be useful).

## The Guards

So now let's get to our guards, as you'll notice up in the `AuthController` we're not using `AuthGuard('local')`, but `LocalGuard`. The reason for this is because we need to end up calling `super.logIn(request)`, which the `AuthGuard` _has_, but doesn't make use of by default. This just ends up calling `request.login(user, (err) => done(err ? err : null, null))` for us, which is how the user serialization happens. This is what kicks off the session. I'll repeat that because it's **super important**. `super.logIn(request)` **is how the user gets a session**. To make use of this method, we can set up the `LocalGuard` as below

```ts
// src/local.guard.ts

import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    await super.logIn(context.switchToHttp().getRequest());
    return result;
  }
}

```

We have another guard as well, the `LoggedInGuard`. This guards ends up just calling `request.isAuthenticated()` which is a method that passport ends up adding to the request object when sessions are in use. We can use this instead of having to have the user pass us the username and password every request, because there will be a cookie with the user's session id on it.

```ts
// src/logged-in.guard.ts

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';


@Injectable()
export class LoggedInGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    return context.switchToHttp().getRequest().isAuthenticated();
  }
}

```

## A couple of extra classes

There's a few other classes that I'm making use of. It'll be easiest to view them in the GitHub repo, but I'll add them here if you just want to copy paste:

```ts
// src/app.controller.ts

import { Controller, Get, UseGuards } from '@nestjs/common';

import { AppService } from './app.service';
import { LoggedInGuard } from './logged-in.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  publicRoute() {
    return this.appService.getPublicMessage();
  }

  @UseGuards(LoggedInGuard)
  @Get('/protected')
  guardedRoute() {
    return this.appService.getPrivateMessage();
  }
}

```

```ts
// src/app.service.ts

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getPublicMessage(): string {
    return 'This message is public to all!';
  }

  getPrivateMessage(): string {
    return 'You can only see this if you are authenticated';
  }
}

```

```ts
// src/main.ts

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log(`Application listening at ${await app.getUrl()}`);
};

bootstrap();

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

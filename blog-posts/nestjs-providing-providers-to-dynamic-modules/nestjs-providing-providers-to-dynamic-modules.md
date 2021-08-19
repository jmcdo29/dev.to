---
title: Providing Providers to Dynamic NestJS Modules
published: true
---

_Jay is a member of the NestJS core team, primarily helping out the community on Discord and Github and contributing to various parts of the framework._

If you've been working with NestJS for a while, you've probably heard of [dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules). If you're rather new to them, the docs do a pretty good job explaining them, and there's an [awesome article](https://dev.to/nestjs/advanced-nestjs-how-to-build-completely-dynamic-nestjs-modules-1370) by John about them as well that I would highly encourage reading. 

I'm going to skip over the basics of dynamic modules, as the above links do a great job of explaining the concepts around them, and I'm going to be jumping into an advanced concept of providing a provider to a dynamic module. Let's unpack that sentence for a moment: we are wanting to call a dynamic module's registration method and provide a service to use instead of the default service the dynamic module already has.

## The Use Case

Let's go with the general use case of having a general `AuthModule` with an `AuthService` that injects `USER_SERVICE`, to allow for swapping between database types (mongo, typeorm, neo4j, raw sql, etc). In doing this, we'd be able to publish the authentication module and let anyone make use of the package, while providing their own `USER_SERVICE` so long as it adheres to the interface we've defined.

### The Setup

For this, I'm going to be using a package called [`@golevelup/nestjs-modules`](https://github.com/golevelup/nestjs/tree/master/packages/modules) to help with the creation of the dynamic module. Instead of having to set up the entire `forRoot` and `forRootAsync` methods, we can extend a mixin and let the package take care of the setup for us. everything in this article will work __without__ the package, I just like using it for the sake of simplicity. So, lets dive into setting up our `AuthModule` to be a dynamic module. First we need to create our injection token for the options

```ts
// src/auth.constants.ts

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');
export const AUTH_SECRET = Symbol('AUTH_SECRET');
export const USER_SERVICE = Symbol('USER_SERVICE');

```

For now, you can ignore the `AUTH_SECRET` and `USER_SERVICE` symbols, but we'll need it here in a moment. The next is to set up the `AuthModule`'s options interface

```ts
// src/auth.interface.ts

import { UserService } from './user-service.interface';

export interface AuthModuleOptions {
  secret: string;
  userService: UserService;
}

```

And the `UserService` interface defined as such:

```ts
// src/user-service.interface.ts

interface User {
  id: string;
  name: string;
  email: string;
}

export interface UserService {
  find: (id: string) => User;
  insert: (user: Exclude<User, 'id'>) => User;
}

```

Now, to make our `AuthModule` we  can simply use the `createConfigurableDynamicModule` method like so:

```ts
// src/auth.module.ts

import { createConfigurableDynamicRootModule } from '@golevelup/nestjs-modules';
import { Module } from '@nestjs/common';

import { AUTH_OPTIONS } from './auth.constants';
import { AuthModuleOptions } from './auth.interface';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService],
})
export class AuthModule extends createConfigurableDynamicRootModule<AuthModule, AuthModuleOptions>(AUTH_OPTIONS) {}

```

And just like that, the module now has a `forRoot`, a `forRootAsync`, and a `externallyConfigured` static method that can all be taken advantage of (for more on the `externallyConfigured` method, take a look at the package's docs).

### The Solution

So now, how do we ensure that users can pass in a `UserService` of their own, and how does our `AuthService` make use of it? Well, let's say that we have the following `AuthService`

```ts
// src/auth.service.ts

import { Injectable, Inject } from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';

import { AUTH_SECRET, USER_SERVICE } from './auth.constants';
import { UserService } from './user-service.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_SECRET) private readonly secret: string,
    @Inject(USER_SERVICE) private readonly userService: UserService,
  ) {}

  findUser(id: string) {
    return this.userService.find(id);
  }

  signToken(payload: Record<string, any>) {
    return sign(payload, this.secret);
  }

  verifyToken(token: string) {
    return verify(token, this.secret);
  }
}

```

We have it set up to inject two providers, `AUTH_SECRET` and `USER_SERVICE` (told you they'd be needed). So now all we need to do is provide these injection tokens. But how do we do that with a dynamic module? Well, taking the module from above, we can pass in a second parameter to the `createConfigurableDynamicModule` method and set up providers that should exist inside the module like so

```ts
// src/auth.module.with-providers.ts

import { createConfigurableDynamicRootModule } from '@golevelup/nestjs-modules';
import { Module } from '@nestjs/common';

import { AUTH_OPTIONS, AUTH_SECRET, USER_SERVICE } from './auth.constants';
import { AuthModuleOptions } from './auth.interface';
import { AuthService } from './auth.service';

@Module({
  providers: [AuthService],
})
export class AuthModule extends createConfigurableDynamicRootModule<AuthModule, AuthModuleOptions>(AUTH_OPTIONS, {
  providers: [
    {
      provide: AUTH_SECRET,
      inject: [AUTH_OPTIONS],
      useFactory: (options: AuthModuleOptions) => options.secret,
    },
    {
      provide: USER_SERVICE,
      inject: [AUTH_OPTIONS],
      useFactory: (options: AuthModuleOptions) => options.userService,
    },
  ],
}) {}

```

Using this approach, we are able to make use of the options passed in at the `forRoot`/`forRootAsync` level, while still allowing for injection of separate providers in the `AuthService`. Making use of this `AuthModule` would look something like the below:

```ts
// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthModule } from './auth';
import { UserModule, UserService } from './user';

@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [ConfigModule, UserModule],
      inject: [ConfigService, UserService],
      useFactory: (config: ConfigService, userService: UserService) => {
        return {
          secret: config.get('AUTH_SECRET_VALUE'),
          userService,
        };
      },
    }),
  ],
})
export class AppModule {}

```

This approach can work in many different contexts, and allows for a nice separation of all the options into smaller, more injectable sub-sets of options, [which is what I do in my OgmaModule](https://github.com/jmcdo29/ogma/blob/main/packages/nestjs-module/src/ogma-core.module.ts#L33).


import { Inject, Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
// NOTE: USE VERSION 3.1.2 OF THE REDIS PACKAGE
// E.g; yarn add redis@3.1.2

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
  providers: [AppService, Logger],
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

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

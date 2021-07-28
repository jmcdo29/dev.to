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

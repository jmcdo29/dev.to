import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log(`Application listening at ${await app.getUrl()}`);
};

bootstrap();

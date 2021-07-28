import { CommandFactory } from 'nest-commander';
import { SayHelloModule } from './say-hello.module';

async function bootstrap() {
  await CommandFactory.run(SayHelloModule);
}
bootstrap();

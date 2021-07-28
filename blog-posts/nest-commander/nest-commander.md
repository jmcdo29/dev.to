---

published: true
title: "Introducing nest-commander"
cover_image:
description:
tags: nestjs, module, cli, command-line-application, package
series:
canonical_url:

---

_Jay is a member of the NestJS core team, primarily helping out the community on Discord and Github and contributing to various parts of the framework._

What's up Nestlings! So you've been developing web servers with NestJS for a while now, and you're in love with the DI context that it brings. You're enthralled by the class first approach, and you have "nest-itis" where you just want everything to work with Nest because, well, it just feels good. But now, after building some web servers and application, you realize you need to be able to run some one-off methods, or maybe you want to provide a full CLI package for one of your projects. You could write these commands using shell scripts (and I wish you the best if so), or you could use a CLI package like `yargs` or `commander`. Those are all fine options, but none of them are using Nest, which is sad for those of you with "nest-itis". So what do you do? You go to Google, type in "nest commander package" and search through the results, finding `nest-commander`. And that's where you see the light.

# What sets nest-commander apart from other Nest CLI packages

## [`nestjs-command`](https://www.npmjs.com/package/nestjs-command)

- uses `yargs` as the underlying CLI engine
- uses parameter decorators for command
- has a `CommandModuleTest` built into the package

## [`nestjs-console`](https://www.npmjs.com/package/nestjs-console)

- uses `commander` for the underlying CLI engine
- has a `ConsoleService` to create commands or can use decorator
- no immediate testing integration

## [`nest-commander`](https://www.npmjs.com/package/nest-commander)

- uses `commander` for the underlying CLI engine
- uses a decorator on a class for a command and a decorator on class methods for command options
- has a separate testing package to not bloat the final CLI package size
- has an `InquirerService` to integrate inquirer into your CLI application
- has a `CommandFactory` to run similar to `NestFactory` for a familiar DX

# How to use it

Okay, so we've talked about what's different, but let's see how we can actually write a command using `nest-commander`.

Let's say we want to create a CLI that takes in a name, and an age and outputs a greeting. Our CLI will have the inputs of `-n personName` and `-a age`. In commander itself, this would look something like

```ts
// src/hello.js

const program = new Command();
program.option('-n <personName>').option('-a <age>');
program.parse(process.argv);
const options = program.options();
options.age = Number.parseInt(options.age, 10);
if (options.age < 13) {
  console.log(`Hello ${options.personName}, you're still rather young!`);
} else if (12 < options.age && options.age < 50) {
  console.log(`Hello ${options.personName}, you're in the prime of your life!`);
} else {
  console.log(`Hello ${options.personName}, getting up there in age, huh? Well, you're only as young as you feel!`);
}
```

This works out well, and it pretty easy to run, but as your program grows it may be difficult to keep all of the logic clean and separated. Plus, in some cases you may need to re-instantiate services that Nest already manages for you. So enter, the `@Command()` decorator and the `CommandRunner` interface.

All `nest-commander` commands implement the `CommandRunner` interface, which says that every `@Command()` will have an `async run(inputs: string[], options?: Record<string, any>): Promise<void>` method. `inputs` are values that are passed directly to the command, as defined by the `arguments` property of the `@Command()` decorator. `options` are the options passed for the command that correlate back to each `@Option()` decorator. The above command could be written with `nest-commander` like so

```ts
// src/say-hello.command.ts

@Command({ name: 'sayHello', options: { isDefault: true } })
export class SayHelloCommand implements CommandRunner {
  async run(inputs: string[], options: { personName: string; age: number }): Promise<void> {
    if (options.age < 13) {
      console.log(`Hello ${options.personName}, you're still rather young!`);
    } else if (12 < options.age && options.age < 50) {
      console.log(`Hello ${options.personName}, you're in the prime of your life!`);
    } else {
      console.log(`Hello ${options.personName}, getting up there in age, huh? Well, you're only as young as you feel!`);
    }
  }

  @Option({ flags: '-n <personName>' })
  parseName(val: string) {
    return val;
  }

  @Option({ flags: '-a <age>' })
  parseAge(val: string) {
    return Number.parseInt(val, 10);
  }
}
```

Now all we need to do is add the `SayHelloCommand` to the Nest application and make use of `CommandFactory` in our `main.ts`.

```ts
// src/say-hello.module.ts

@Module({
  providers: [SayHelloCommand],
})
export class SayHelloModule {}
```

```ts
// src/main.ts

import { CommandFactory } from 'nest-commander';
import { SayHelloModule } from './say-hello.module';

async function bootstrap() {
  await CommandFactory.run(SayHelloModule);
}
bootstrap();
```

And there you have it, the command is fully operational. If you end up forgetting to pass in an option, commander will inform you the call is invalid.

Now, this is all fine and dandy, but the real magic, as mentioned before, is that all of Nest's DI context still works! So long as you are using singleton or transient providers, there's no limitation to what the `CommandFactory` can manage.

## InquirerService

So now what? You've got this fancy CLI application and it runs awesome, but what about when you want to get user input during runtime, not just when starting the application. Well, that's where the `InquirerService` comes in. The first thing that needs to happen is a class with `@QuestionSet()` needs to be created. This will be the class that holds the questions for the named set. The name is important as it will be used in the `InquirerService` later. Say that we want to get the name and age at runtime or at start time, first we need to change the options to optional by changing from chevrons to brackets (i.e. `<personName>` to `[personName]`). Next, we need to create our question set

```ts
// src/person.question.ts

@QuestionSet({ name: 'personInfo' })
export class PersonInfoQuestions {
  @Question({
    type: 'input',
    name: 'personInput',
    message: 'What is your name?',
  })
  parseName(val: string) {
    return val;
  }

  @Question({
    type: 'input',
    name: 'age',
    message: 'How old are you?',
  })
  parseAge(val: string) {
    return Number.parseInt(val, 10);
  }
}
```

Now in the `SayHelloCommand` we need to add in the `InquirerService` and ask for the information.

```ts
// src/say-hello-with-question.command.ts

@Command({ name: 'sayHello', options: { isDefault: true } })
export class SayHelloCommand implements CommandRunner {
  constructor(private readonly inquirerService: InquirerService) {}

  async run(inputs: string[], options: { personName?: string; age?: number }): Promise<void> {
    options = await this.inquirerService.ask('personInfo', options);
    if (options.age < 13) {
      console.log(`Hello ${options.personName}, you're still rather young!`);
    } else if (12 < options.age && options.age < 50) {
      console.log(`Hello ${options.personName}, you're in the prime of your life!`);
    } else {
      console.log(`Hello ${options.personName}, getting up there in age, huh? Well, you're only as young as you feel!`);
    }
  }
}
```

The rest of the class follows as above. Now we can pass in the `options` commander already found, and inquirer will skip over asking for them again, allowing for the a great UX by not having to duplicate their information (now if only resume services were so nice). Now in `SayHelloModule` we add in the `PersonInfoQuestions` to the `providers` and everything else just works :tm:

```ts
// src/say-hello-with-question.module.ts

@Module({
  providers: [SayHelloCommand, PersonInfoQuestions],
})
export class SayHelloModule {}
```

And just like that, we've now created a command line application using `nest-commander`, allowing for users to pass the info in via flags or using prompts and asking for it at runtime.

For more information on the project [you can check the repo here](https://github.com/jmcdo29/nestjs-commander). There's also a testing package to help with testing both the commander input and the inquirer input. Feel free to raise any issues or use the #nest-commander channel on the

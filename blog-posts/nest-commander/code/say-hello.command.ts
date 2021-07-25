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

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

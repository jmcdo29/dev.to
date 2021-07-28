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

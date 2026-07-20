export const foundationalScreeningQuestions = [
  {
    id: "q1",
    question: "According to the biblical Gospel, salvation is best described as:",
    options: [
      { value: "A", label: "A reward for sufficient good works" },
      { value: "B", label: "By grace through faith in Jesus Christ, not earned by human works" },
      { value: "C", label: "A result of belonging to a Christian family" },
      { value: "D", label: "Achieved through religious activity alone" },
    ],
  },
  {
    id: "q2",
    question: "Which statement best describes justification?",
    options: [
      { value: "A", label: "God declaring the believer righteous on the basis of Christ" },
      { value: "B", label: "A believer becoming incapable of sin" },
      { value: "C", label: "Human effort to improve moral behaviour" },
      { value: "D", label: "Membership in a local church" },
    ],
  },
  {
    id: "q3",
    question: "Regeneration or the new birth primarily refers to:",
    options: [
      { value: "A", label: "Changing church denomination" },
      { value: "B", label: "God giving spiritual life and making a person new in Christ" },
      { value: "C", label: "Becoming more religious" },
      { value: "D", label: "Learning Christian terminology" },
    ],
  },
  {
    id: "q4",
    question: "The primary purpose of Christian spiritual disciplines such as prayer, Scripture and fasting is:",
    options: [
      { value: "A", label: "To earn salvation" },
      { value: "B", label: "To prove superiority over other Christians" },
      { value: "C", label: "To respond to God's grace, grow in communion with Him and practise obedience" },
      { value: "D", label: "To guarantee material prosperity" },
    ],
  },
  {
    id: "q5",
    question: "Which best distinguishes divine calling from selfish ambition?",
    options: [
      { value: "A", label: "Calling always produces public recognition" },
      { value: "B", label: "Calling is faithful response to God's purpose and responsibility, while ambition may pursue self-exaltation" },
      { value: "C", label: "Ambition is always sinful regardless of motive" },
      { value: "D", label: "Calling removes the need for preparation" },
    ],
  },
  {
    id: "q6",
    question: "Biblical leadership is best understood as:",
    options: [
      { value: "A", label: "Personal power and control" },
      { value: "B", label: "Position and public recognition" },
      { value: "C", label: "Stewardship and service under God" },
      { value: "D", label: "Freedom from accountability" },
    ],
  },
  {
    id: "q7",
    question: "Which approach best reflects Christian financial stewardship?",
    options: [
      { value: "A", label: "Honest earning, responsible planning, generosity, contentment and integrity" },
      { value: "B", label: "Pursuing wealth at any cost" },
      { value: "C", label: "Avoiding all planning because faith is enough" },
      { value: "D", label: "Giving money in order to manipulate God" },
    ],
  },
  {
    id: "q8",
    question: "The Great Commission calls believers to:",
    options: [
      { value: "A", label: "Avoid people from other cultures" },
      { value: "B", label: "Make disciples of all nations and teach obedience to Christ" },
      { value: "C", label: "Build personal influence" },
      { value: "D", label: "Force people to accept Christianity" },
    ],
  },
  {
    id: "q9",
    question: "Which approach best reflects responsible Christian evangelism across cultures?",
    options: [
      { value: "A", label: "Manipulation and pressure" },
      { value: "B", label: "Ignoring cultural context completely" },
      { value: "C", label: "Faithfully communicating the Gospel with humility, listening and respect" },
      { value: "D", label: "Promising material benefits for conversion" },
    ],
  },
  {
    id: "q10",
    question: "A believer's identity in Christ should lead to:",
    options: [
      { value: "A", label: "Trying to earn God's acceptance through performance" },
      { value: "B", label: "Obedience flowing from God's grace and acceptance in Christ" },
      { value: "C", label: "Freedom from all responsibility" },
      { value: "D", label: "Spiritual pride" },
    ],
  },
] as const;

export const foundationalScreeningShortAnswers = [
  {
    id: "short_answer_1",
    question: "In your own words, briefly explain the Gospel of Jesus Christ and what salvation means.",
    recommendedLength: "100–250 words",
  },
  {
    id: "short_answer_2",
    question: "Explain how grace, spiritual disciplines and Christian obedience should relate to one another without becoming legalistic.",
    recommendedLength: "100–250 words",
  },
] as const;

export type FoundationalQuestionId = (typeof foundationalScreeningQuestions)[number]["id"];
export type FoundationalShortAnswerId = (typeof foundationalScreeningShortAnswers)[number]["id"];
export type FoundationalAnswerOption = "A" | "B" | "C" | "D";

export type FoundationalScreeningAnswers = {
  objective: Array<{ questionId: FoundationalQuestionId; answer: FoundationalAnswerOption }>;
  shortAnswers: Array<{ questionId: FoundationalShortAnswerId; response: string }>;
};

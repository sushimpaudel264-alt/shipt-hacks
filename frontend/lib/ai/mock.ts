import "server-only";
/** Realistic canned AI output used when MOCK_AI=true or no Gemini key/model is configured. */
import type { CourseSummary } from "@/lib/types";
import type { DraftCourse, DraftLearningPath, DraftQuestion, DraftTutor } from "./schemas";

export const MOCK_MODEL = "mock-ai";

const INTRO_TO_PYTHON: DraftCourse = {
  title: "Intro to Python",
  description: "Learn to talk to computers with Python! Print messages, store treasures in variables, and teach your code to make decisions.",
  thumbnailEmoji: "🐍",
  category: "coding",
  difficulty: "beginner",
  estimatedMinutes: 36,
  ageRange: { min: 9, max: 14 },
  lessons: [
    {
      title: "Talking to the Computer with print()",
      summary: "Make Python say anything you want.",
      estimatedMinutes: 12,
      xpReward: 20,
      sections: [
        { type: "story", title: "Meet Py the Pen Pal", body: "Py is a little robot who lives inside your computer. Py loves getting letters, but only understands Python! Today you'll send Py your very first message." },
        { type: "analogy", title: "print() is a megaphone", body: "When you put words inside print(), Python shouts them onto the screen, just like a megaphone makes your voice loud for everyone to hear." },
        { type: "explanation", title: "How print works", body: "Type print, then parentheses ( ). Inside them, put your message in quotes. The quotes tell Python \"this is text, not a command\"." },
        { type: "example", title: "Your first program", body: "Run this and Python shows two lines on the screen.", code: 'print("Hello, Py!")\nprint("I am learning Python")' },
        {
          type: "interactive-exercise",
          title: "Spot the mistake",
          body: "One of these lines will work. Which one?",
          activity: { kind: "choose", prompt: "Which line prints Hi?", options: ['print("Hi")', "print(Hi)", 'Print "Hi"'], answer: 'print("Hi")', hint: "Look for the quotes and the parentheses.", successMessage: "Yes! Text needs quotes, inside parentheses." },
        },
        { type: "practice-challenge", title: "Practice challenge: Say hello", body: "Write a program that prints your favorite animal and then your favorite color on two lines.", hint: "Use print() twice.", solution: 'print("Cats")\nprint("Blue")' },
      ],
      questions: [
        { type: "multiple-choice", prompt: "What does print() do?", options: ["Shows a message on the screen", "Turns off the computer", "Deletes a file"], correctAnswer: "Shows a message on the screen", explanation: "print() is like a megaphone: it shows your message on the screen." },
        { type: "true-false", prompt: 'print("Hello") needs quotes around Hello.', options: ["true", "false"], correctAnswer: "true", explanation: "Quotes tell Python that Hello is text." },
        { type: "fill-in-the-blank", prompt: "To show a message in Python, you use the ____ function.", correctAnswer: "print", acceptableAnswers: ["print()"], explanation: "print() displays messages." },
      ],
    },
    {
      title: "Variables: Treasure Chests",
      summary: "Store information so your program can remember it.",
      estimatedMinutes: 12,
      xpReward: 20,
      sections: [
        { type: "story", title: "Py Forgets Everything", body: "Py tried to remember your name, but robots forget unless they store things somewhere safe. Py needs a treasure chest!" },
        { type: "analogy", title: "Variable = Treasure Chest", body: "A variable is a chest with a name tag. The value is the treasure inside. You can swap the treasure any time, but the name tag stays." },
        { type: "example", title: "Making variables", body: "The name goes on the left of =, the value on the right.", code: 'name = "Py"\nage = 3\nprint(name)\nprint(age + 1)' },
        {
          type: "interactive-exercise",
          title: "What's inside?",
          body: 'stars = 2\nstars = stars + 5',
          activity: { kind: "fill-in", prompt: "What value is in stars now?", answer: "7", hint: "Take the 2 out, add 5, put it back.", successMessage: "Correct! 2 + 5 = 7." },
        },
        { type: "practice-challenge", title: "Practice challenge", body: "Make a variable called pets with the value 2, then print it.", hint: "pets = 2, then print(pets).", solution: "pets = 2\nprint(pets)" },
      ],
      questions: [
        { type: "multiple-choice", prompt: "In score = 10, what is the variable's name?", options: ["score", "10", "="], correctAnswer: "score", explanation: "The name is on the left side of the equals sign." },
        { type: "true-false", prompt: "A variable's value can change.", options: ["true", "false"], correctAnswer: "true", explanation: "You can always put new treasure in the chest." },
        { type: "fill-in-the-blank", prompt: "After x = 4 and x = x + 2, x is ____.", correctAnswer: "6", acceptableAnswers: ["six"], explanation: "4 + 2 = 6." },
      ],
    },
    {
      title: "Making Decisions with if",
      summary: "Teach your code to choose.",
      estimatedMinutes: 12,
      xpReward: 25,
      sections: [
        { type: "story", title: "Py Packs for the Weather", body: "Py wants to go outside. If it's raining, Py needs an umbrella. If not, sunglasses! How can Py decide?" },
        { type: "analogy", title: "if is a choose-your-own-adventure book", body: "\"If you open the door, turn to page 10. Otherwise, turn to page 20.\" Your program picks a path depending on what's true." },
        { type: "example", title: "Py decides", body: "Python checks the condition after if.", code: 'raining = True\nif raining:\n    print("Umbrella!")\nelse:\n    print("Sunglasses!")' },
        {
          type: "interactive-exercise",
          title: "Which path?",
          body: 'temperature = 30\nif temperature > 25:\n    print("Hot!")\nelse:\n    print("Nice!")',
          activity: { kind: "choose", prompt: "What gets printed?", options: ["Hot!", "Nice!"], answer: "Hot!", successMessage: "Right! 30 is more than 25." },
        },
        { type: "practice-challenge", title: "Practice challenge", body: "Write code that prints \"Snack time\" if snacks is more than 0, otherwise \"No snacks\".", hint: "if snacks > 0: ... else: ...", solution: 'if snacks > 0:\n    print("Snack time")\nelse:\n    print("No snacks")' },
      ],
      questions: [
        { type: "multiple-choice", prompt: "Which word starts a decision in Python?", options: ["if", "print", "loop"], correctAnswer: "if", explanation: "if checks whether something is true." },
        { type: "true-false", prompt: "The else part runs when the if condition is true.", options: ["true", "false"], correctAnswer: "false", explanation: "else runs when the condition is NOT true." },
        { type: "multiple-choice", prompt: "If raining = False, what does Py print?", options: ["Umbrella!", "Sunglasses!"], correctAnswer: "Sunglasses!", explanation: "The condition is false, so the else path runs." },
      ],
    },
  ],
};

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Templated course for any other topic, so mock mode still demos "generate anything". */
export function mockCourseFor(topic: string): DraftCourse {
  if (/python/i.test(topic)) return INTRO_TO_PYTHON;
  const t = titleCase(topic.replace(/^i want to learn\s*/i, "").replace(/[.!?]+$/, "").trim() || "Something New");
  const lesson = (n: number, title: string, focus: string): DraftCourse["lessons"][number] => ({
    title,
    summary: `Lesson ${n}: ${focus}`,
    estimatedMinutes: 10,
    xpReward: 20,
    sections: [
      { type: "story", title: `Nova's ${t} Adventure`, body: `Nova the explorer just discovered ${t} and can't wait to share it with you. Let's find out ${focus.toLowerCase()}.` },
      { type: "analogy", title: "Think of it like building blocks", body: `Learning ${t} is like building with blocks: start with a strong base, then stack new ideas on top, one at a time.` },
      { type: "explanation", title: `The big idea`, body: `${focus} Experts in ${t} practice a little every day and ask lots of questions.` },
      {
        type: "interactive-exercise",
        title: "Quick check",
        body: "Which habit helps you learn fastest?",
        activity: { kind: "choose", prompt: "Pick the best habit", options: ["Practice a little every day", "Never ask questions", "Skip the basics"], answer: "Practice a little every day" },
      },
      { type: "practice-challenge", title: "Practice challenge", body: `Write down three questions you have about ${t}.`, hint: "Start your questions with who, what, why or how.", solution: `Any three curious questions about ${t} are perfect!` },
    ],
    questions: [
      { type: "multiple-choice", prompt: `What's the best way to get better at ${t}?`, options: ["Practice regularly", "Give up quickly", "Never try"], correctAnswer: "Practice regularly", explanation: "Practice builds skills, one block at a time." },
      { type: "true-false", prompt: "Asking questions is a great way to learn.", options: ["true", "false"], correctAnswer: "true", explanation: "Curious learners ask lots of questions!" },
      { type: "fill-in-the-blank", prompt: "Learning is like building with ____.", correctAnswer: "blocks", acceptableAnswers: ["block", "building blocks"], explanation: "Each new idea stacks on the ones before it." },
    ],
  });
  return {
    title: `Exploring ${t}`,
    description: `A beginner-friendly introduction to ${t}, made just for you by Nova.`,
    thumbnailEmoji: "✨",
    category: "other",
    difficulty: "beginner",
    estimatedMinutes: 30,
    ageRange: { min: 8, max: 14 },
    lessons: [
      lesson(1, `What is ${t}?`, `What ${t} is and why people love it.`),
      lesson(2, `${t} Building Blocks`, `The key ideas that everything in ${t} is built on.`),
      lesson(3, `Your First ${t} Project`, `How to use what you learned in a small project.`),
    ],
  };
}

export function mockQuiz(topic: string, count = 5): DraftQuestion[] {
  const pool = /python/i.test(topic)
    ? INTRO_TO_PYTHON.lessons.flatMap((l) => l.questions)
    : mockCourseFor(topic).lessons[0].questions;
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[i]);
}

export function mockLearningPath(goal: string, catalog: CourseSummary[]): DraftLearningPath {
  const coding = /code|coding|program|python|game|app|web/i.test(goal);
  const pick = (id: string) => catalog.find((c) => c.id === id);
  const steps: DraftLearningPath["steps"] = [];
  const first = coding ? pick("code-adventure") : pick("science-explorer") ?? catalog[0];
  if (first) steps.push({ title: `Start with ${first.title}`, description: first.description, courseId: first.id, estimatedMinutes: first.estimatedMinutes });
  const math = pick("math-quest");
  if (math) steps.push({ title: "Sharpen your problem solving", description: "Math patterns help you think like a scientist and a coder.", courseId: math.id, estimatedMinutes: math.estimatedMinutes });
  steps.push({ title: `Go deeper: ${goal}`, description: "Generate a custom course with AI to explore exactly what you're curious about.", suggestedTopic: goal.slice(0, 100), estimatedMinutes: 30 });
  const dc = pick("digital-citizenship");
  if (dc) steps.push({ title: "Be a smart digital citizen", description: "Learn to stay safe and kind online while you explore.", courseId: dc.id, estimatedMinutes: dc.estimatedMinutes });
  return { summary: `Here's a ${steps.length}-step path toward "${goal}". Take it one step at a time. You've got this! 🚀`, steps };
}

const UNSAFE = /\b(address|phone|password|where do you live|kill|gun|weapon|drug|beer|vape|date me|sexy|hack (someone|my)|meet up)\b/i;
const WANTS_ANSWER = /\b(answer|solve|solution|what is the answer|do my|homework)\b/i;

export function mockTutor(question: string, context?: { lessonTitle?: string }): DraftTutor {
  if (UNSAFE.test(question)) {
    return {
      answer: "That's not something I can help with, and remember to keep personal info private! 🛡️ But I'd love to help you learn something awesome. Want to explore how computers keep secrets safe with passwords, or try a fun science fact?",
      redirected: true,
      followUpQuestion: "What topic are you curious about today?",
    };
  }
  const topic = context?.lessonTitle ? ` about ${context.lessonTitle}` : "";
  if (WANTS_ANSWER.test(question)) {
    return {
      answer: `Great question${topic}! Let's figure it out together instead of me just telling you. 🧩 Try breaking the problem into small steps: what do you already know, and what is the question asking you to find? Think of it like a treasure map: find where you are first, then the next landmark.`,
      redirected: false,
      followUpQuestion: "What's the very first step you think you should take?",
    };
  }
  return {
    answer: `Ooh, I love that question${topic}! 🌟 Think of it like a treasure chest: each new idea you learn is a gem you can keep and use later. Start with what you already know, then add one new piece at a time. Mistakes are totally okay. They're how our brains grow!`,
    redirected: false,
    followUpQuestion: "Can you explain the idea back to me in your own words?",
  };
}

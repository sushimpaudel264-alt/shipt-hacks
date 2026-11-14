import type { Course } from "@/lib/types";
import { analogy, buildCourse, challenge, example, exercise, explain, fill, mc, story, tf } from "./builders";

const SEED_DATE = "2026-11-01T12:00:00.000Z";

const codeAdventure = buildCourse({
  id: "code-adventure",
  title: "Code Adventure",
  description: "Become a junior coder! Learn variables, loops and decisions by helping Pixel the robot explore a treasure island.",
  thumbnailEmoji: "🤖",
  category: "coding",
  difficulty: "beginner",
  estimatedMinutes: 45,
  ageRange: { min: 8, max: 13 },
  organizationId: "org-edfarm",
  authorId: "contrib-edfarm",
  status: "published",
  version: 1,
  source: "official",
  updatedAt: SEED_DATE,
  lessons: [
    {
      slug: "variables",
      title: "Variables",
      summary: "Learn how programs remember things using variables, your code's treasure chests.",
      estimatedMinutes: 15,
      xpReward: 20,
      sections: [
        story(
          "Pixel's Treasure Problem",
          "Pixel the robot just landed on Treasure Island. On the beach, Pixel finds a shiny gold coin, a map, and a rubber duck. " +
            "But Pixel has a problem: robots forget everything unless they write it down somewhere special! " +
            "Every time Pixel walks to a new spot, the memory of the coin disappears. " +
            "\"I need a way to keep track of my treasures,\" beeps Pixel. Luckily, the island's wise old parrot, Captain Byte, knows a secret: variables.",
        ),
        analogy(
          "Variable = Treasure Chest, Value = Item Inside the Chest",
          "Imagine a treasure chest with a name tag on the front, like \"coins\". The chest is the VARIABLE. " +
            "Whatever is inside the chest, like the number 5, is the VALUE. " +
            "You can open the chest by its name any time to see what's inside. You can also take the old item out and put a new one in. " +
            "The name tag stays the same, but the treasure inside can change!",
        ),
        explain(
          "What is a variable?",
          "A variable is a named place where a program stores information so it can use it later. " +
            "Creating a variable has two parts: picking a NAME (the label on the chest) and giving it a VALUE (the treasure inside). " +
            "Values can be numbers like 5, words like \"parrot\" (words go inside quotes), or true/false answers. " +
            "When you put a new value in a variable, the old value is replaced.",
        ),
        example(
          "Pixel writes some code",
          "Here Pixel creates two treasure chests, then changes what's inside one of them. Read it line by line.",
          'coins = 5\npet = "parrot"\ncoins = coins + 3\nprint(coins)   # shows 8\nprint(pet)     # shows parrot',
        ),
        exercise("Open the chest", "Pixel ran this code:\n\ngems = 2\ngems = 10\n\nWhat value is inside the gems chest now?", {
          kind: "choose",
          prompt: "What is the value of gems?",
          options: ["2", "10", "12", "gems"],
          answer: "10",
          hint: "When you put a new treasure in a chest, the old one is taken out.",
          successMessage: "Exactly! The second line replaced 2 with 10.",
        }),
        challenge(
          "Practice challenge: Pack Pixel's backpack",
          "Write code that creates a variable called snacks with the value 3. Then Pixel finds 2 more snacks, so update snacks to add 2. What value is in snacks at the end?",
          "Start with snacks = 3. To add, use the variable's own name on the right side: snacks = snacks + 2.",
          "snacks = 3\nsnacks = snacks + 2\n# snacks is now 5",
        ),
      ],
      questions: [
        mc(
          "In the treasure chest analogy, what is the VARIABLE?",
          ["The treasure chest with a name tag", "The item inside the chest", "The pirate", "The island"],
          "The treasure chest with a name tag",
          "The chest (with its name tag) is the variable. The item inside is the value.",
        ),
        tf(
          "A variable can only ever hold one value, and it can never change.",
          false,
          "Variables can change! You can take the old treasure out and put a new one in at any time.",
        ),
        fill(
          "After running `score = 4` and then `score = score + 1`, the value of score is ____.",
          "5",
          "score starts at 4. Then we take what's inside (4), add 1, and put 5 back in the chest.",
          ["five"],
        ),
        mc(
          'Which line creates a variable named pet that holds the word parrot?',
          ['pet = "parrot"', 'parrot = "pet"', "pet + parrot", 'print("pet")'],
          'pet = "parrot"',
          "The name goes on the left of the = sign, and the value goes on the right. Words go inside quotes.",
        ),
      ],
    },
    {
      slug: "loops",
      title: "Loops",
      summary: "Make the computer repeat things so you don't have to.",
      xpReward: 20,
      sections: [
        story("Pixel's Long Walk", "Captain Byte tells Pixel to take 10 steps to reach the cave. Pixel starts typing \"step\" ten times... until Captain Byte squawks: \"Use a loop!\""),
        analogy("A loop is like a song chorus", "When a song says \"repeat the chorus 3 times\", the singer doesn't need it written out 3 times. A loop tells the computer to repeat instructions a certain number of times."),
        example("Repeat with a for loop", "This loop runs the step command 10 times.", 'for i in range(10):\n    print("step")'),
        exercise("Count the repeats", "for i in range(4):\n    print(\"hop\")", {
          kind: "fill-in",
          prompt: "How many times will \"hop\" be printed?",
          answer: "4",
          hint: "range(4) counts 0, 1, 2, 3.",
          successMessage: "Yes! range(4) means 4 repeats.",
        }),
      ],
      questions: [
        mc("What does a loop do?", ["Repeats instructions", "Deletes code", "Stores one value", "Turns off the computer"], "Repeats instructions", "Loops repeat a set of instructions so you don't have to write them again and again."),
        tf("`for i in range(3):` repeats the code inside it 3 times.", true, "range(3) gives 0, 1 and 2, which is 3 repeats."),
        fill("To print \"hi\" 5 times you can write: for i in range(___):", "5", "range(5) repeats 5 times."),
      ],
    },
    {
      slug: "conditionals",
      title: "If / Else Decisions",
      summary: "Teach your program to make choices.",
      xpReward: 20,
      sections: [
        story("The Fork in the Path", "Pixel reaches a fork in the path. If it is raining, Pixel should take the cave path. Otherwise, the beach path is faster."),
        analogy("If/else is like a light switch", "IF the switch is up, the light is on. ELSE (otherwise) the light is off. A program checks a condition and picks one path."),
        example("Pixel decides", "The program checks the raining variable.", 'raining = True\nif raining:\n    print("Take the cave path")\nelse:\n    print("Take the beach path")'),
        challenge("Practice challenge: Snack check", "Write an if/else that prints \"Eat a snack\" if snacks is more than 0, otherwise prints \"Go find snacks\".", "Use `if snacks > 0:` and then `else:`.", 'if snacks > 0:\n    print("Eat a snack")\nelse:\n    print("Go find snacks")'),
      ],
      questions: [
        mc("What does `else` mean in code?", ["Otherwise", "Repeat", "Stop forever", "Add"], "Otherwise", "else runs when the if condition is not true."),
        tf("An if statement checks whether something is true.", true, "if checks a condition and only runs its code when the condition is true."),
        mc('If raining = False, what does the example print?', ["Take the cave path", "Take the beach path", "Nothing", "Both"], "Take the beach path", "The if condition is false, so the else path runs."),
      ],
    },
  ],
});

const mathQuest = buildCourse({
  id: "math-quest",
  title: "Math Quest",
  description: "Slice pizzas, crack number patterns and read treasure maps while building real math skills.",
  thumbnailEmoji: "🧮",
  category: "math",
  difficulty: "beginner",
  estimatedMinutes: 40,
  ageRange: { min: 9, max: 13 },
  organizationId: "org-city-school",
  authorId: "contrib-teacher",
  status: "published",
  version: 1,
  source: "official",
  updatedAt: SEED_DATE,
  lessons: [
    {
      slug: "fractions",
      title: "Fractions as Pizza Slices",
      sections: [
        analogy("A fraction is a pizza", "If a pizza is cut into 8 equal slices and you eat 3, you ate 3/8 of the pizza. The bottom number is how many equal slices there are. The top number is how many you have."),
        explain("Numerator and denominator", "The top number is the numerator. The bottom number is the denominator. 3/8 means 3 out of 8 equal parts."),
        exercise("Pizza party", "A pizza has 4 equal slices. You eat 1.", { kind: "choose", prompt: "What fraction did you eat?", options: ["1/4", "4/1", "1/2", "3/4"], answer: "1/4" }),
      ],
      questions: [
        mc("In 3/8, what is the denominator?", ["3", "8", "11", "5"], "8", "The denominator is the bottom number: the total number of equal parts."),
        tf("1/2 of a pizza is more than 1/4 of the same pizza.", true, "Half the pizza is two quarter slices, so it's more."),
        fill("If a cake has 6 equal pieces and you eat 2, you ate __/6.", "2", "You ate 2 of the 6 pieces: 2/6."),
      ],
    },
    {
      slug: "patterns",
      title: "Patterns & Sequences",
      sections: [
        story("The Secret Door Code", "A door has numbers carved on it: 2, 4, 6, 8, ... The door opens if you say the next number."),
        explain("Finding the rule", "A sequence follows a rule. In 2, 4, 6, 8 the rule is \"add 2\". Find the rule by checking how each number changes."),
        challenge("Practice challenge", "What comes next: 5, 10, 15, 20, ___?", "What do you add each time?", "25 (the rule is add 5)"),
      ],
      questions: [
        fill("What comes next: 3, 6, 9, 12, ___", "15", "The rule is add 3, so 12 + 3 = 15."),
        mc("What is the rule in 1, 2, 4, 8, 16?", ["Add 1", "Double it", "Add 4", "Subtract 2"], "Double it", "Each number is twice the one before."),
        tf("The sequence 10, 8, 6, 4 follows the rule \"subtract 2\".", true, "Each number is 2 less than the one before."),
      ],
    },
    {
      slug: "coordinates",
      title: "Coordinate Treasure Maps",
      sections: [
        analogy("Coordinates are like a street address", "A point like (3, 2) tells you where to go: 3 steps right along the x-axis, then 2 steps up the y-axis."),
        example("Find the treasure", "The treasure is buried at (4, 1). Start at (0, 0), walk 4 right, then 1 up."),
        exercise("Which way first?", "For the point (5, 3):", { kind: "choose", prompt: "Which number tells you how far RIGHT to go?", options: ["5", "3"], answer: "5" }),
      ],
      questions: [
        mc("In (2, 7), how far up do you go?", ["2", "7", "9", "0"], "7", "The second number is the y value: how far up."),
        tf("The point (0, 0) is called the origin.", true, "The origin is where the x-axis and y-axis meet."),
        fill("The first number in a coordinate pair is the __ value.", "x", "Coordinates are written (x, y).", ["x-value", "x coordinate"]),
      ],
    },
  ],
});

const scienceExplorer = buildCourse({
  id: "science-explorer",
  title: "Science Explorer",
  description: "Investigate solids, liquids and gases, follow a raindrop around the water cycle, and discover forces.",
  thumbnailEmoji: "🔬",
  category: "science",
  difficulty: "beginner",
  estimatedMinutes: 40,
  ageRange: { min: 8, max: 12 },
  organizationId: "org-stem",
  authorId: "contrib-mentor",
  status: "published",
  version: 1,
  source: "official",
  updatedAt: SEED_DATE,
  lessons: [
    {
      slug: "states-of-matter",
      title: "States of Matter",
      sections: [
        analogy("Molecules are like kids at recess", "In a solid, the kids stand in tight lines. In a liquid they walk around close together. In a gas they run all over the playground!"),
        explain("Solid, liquid, gas", "Solids keep their shape. Liquids take the shape of their container. Gases spread out to fill any space. Heating or cooling can change one state into another."),
        exercise("Ice cube mystery", "You leave an ice cube in the sun.", { kind: "choose", prompt: "What state does it become?", options: ["Liquid", "Solid", "Gas"], answer: "Liquid" }),
      ],
      questions: [
        mc("Which state of matter keeps its own shape?", ["Solid", "Liquid", "Gas"], "Solid", "Solids have particles packed tightly, so they keep their shape."),
        tf("Steam from a kettle is water in its gas state.", true, "Steam is water vapor, a gas."),
        fill("When a liquid turns into a solid, we say it ______.", "freezes", "Freezing turns liquids into solids.", ["freeze", "froze", "freezing"]),
      ],
    },
    {
      slug: "water-cycle",
      title: "The Water Cycle",
      sections: [
        story("Drip's Journey", "Drip the raindrop warms up in the ocean, floats into the sky, joins a cloud, and falls back as rain. Then it all starts again!"),
        explain("Four steps", "Evaporation (water turns to vapor), condensation (vapor forms clouds), precipitation (rain or snow falls), and collection (water gathers in oceans, lakes and rivers)."),
        challenge("Practice challenge", "Put these in order: precipitation, evaporation, collection, condensation.", "Start with the sun warming water.", "Evaporation → condensation → precipitation → collection"),
      ],
      questions: [
        mc("What is it called when water vapor forms clouds?", ["Condensation", "Evaporation", "Collection", "Melting"], "Condensation", "Condensation is when vapor cools and becomes tiny droplets that make clouds."),
        tf("Rain and snow are both kinds of precipitation.", true, "Any water falling from clouds is precipitation."),
        fill("The sun heats water and turns it into vapor. This is called ______.", "evaporation", "Evaporation is liquid water turning into gas."),
      ],
    },
    {
      slug: "forces",
      title: "Forces & Motion",
      sections: [
        analogy("Forces are pushes and pulls", "Kicking a ball is a push. Opening a door toward you is a pull. Every change in motion needs a force."),
        explain("Gravity and friction", "Gravity pulls things toward Earth. Friction is a force that slows things down when surfaces rub together."),
        exercise("Slide test", "A toy car rolls on carpet and on a smooth floor.", { kind: "choose", prompt: "Where does friction slow it down more?", options: ["Carpet", "Smooth floor"], answer: "Carpet" }),
      ],
      questions: [
        mc("Which force pulls objects toward Earth?", ["Gravity", "Friction", "Magnetism", "Wind"], "Gravity", "Gravity is the pull of Earth's mass."),
        tf("Friction makes moving things speed up.", false, "Friction slows things down."),
        mc("Kicking a soccer ball is an example of a...", ["Push", "Pull", "Neither"], "Push", "Your foot pushes the ball away."),
      ],
    },
  ],
});

const digitalCitizenship = buildCourse({
  id: "digital-citizenship",
  title: "Digital Citizenship",
  description: "Be safe, smart and kind online: make strong passwords, spot fake news, and be an upstander.",
  thumbnailEmoji: "🛡️",
  category: "digital-citizenship",
  difficulty: "beginner",
  estimatedMinutes: 35,
  ageRange: { min: 8, max: 16 },
  organizationId: "org-edfarm",
  authorId: "contrib-edfarm",
  status: "published",
  version: 1,
  source: "official",
  updatedAt: SEED_DATE,
  lessons: [
    {
      slug: "passwords",
      title: "Strong Passwords",
      sections: [
        analogy("A password is a toothbrush", "Don't share it, change it if it might be used by someone else, and pick a good one!"),
        explain("What makes a password strong", "Long passphrases made of random words (like PurpleTacoRocket42!) are much harder to guess than short words or birthdays. Never share passwords with friends."),
        exercise("Pick the strongest", "Which password is strongest?", { kind: "choose", prompt: "Choose one", options: ["password1", "jordan2014", "BlueMoonPizzaJump!7"], answer: "BlueMoonPizzaJump!7" }),
      ],
      questions: [
        tf("It's okay to share your password with your best friend.", false, "Passwords are private. Only share them with a trusted parent or guardian."),
        mc("Which is the strongest password?", ["123456", "qwerty", "TigerCloudSock$93"], "TigerCloudSock$93", "Long, random passphrases with mixed characters are strongest."),
        fill("A password made of several random words is called a pass______.", "phrase", "Passphrases are long and easy to remember.", ["passphrase"]),
      ],
    },
    {
      slug: "fake-news",
      title: "Spotting Fake News",
      sections: [
        story("The Shark in the Mall", "Maya sees a photo online of a shark swimming in a flooded mall. It has 2 million shares! Is it real?"),
        explain("Be a fact detective", "Ask: Who made this? Is it on trusted news sites? Does the photo look edited? Strong feelings like shock can be a sign someone wants you to share without thinking."),
        challenge("Practice challenge", "Name two questions you can ask before sharing a surprising post.", "Think about the source and other sites.", "Who made this? Can I find it on other trusted sources?"),
      ],
      questions: [
        tf("If a post has lots of shares, it must be true.", false, "Lots of shares doesn't make something true. Check the source!"),
        mc("What's a good first step before sharing a surprising story?", ["Check if trusted sources report it", "Share it fast", "Add more emojis"], "Check if trusted sources report it", "Fact detectives check sources first."),
        mc("A headline makes you super angry. What should you do?", ["Slow down and check it", "Share it immediately", "Comment in all caps"], "Slow down and check it", "Strong emotions can be used to trick people into sharing."),
      ],
    },
    {
      slug: "kindness-online",
      title: "Kindness Online",
      sections: [
        explain("Be an upstander", "An upstander helps when they see someone being treated unkindly online: they support the person, don't share mean posts, and tell a trusted adult."),
        analogy("Words online are like toothpaste", "Once you squeeze toothpaste out, it's really hard to put back. Posts and messages can be hard to take back too, so think before you post."),
        exercise("What would you do?", "Someone posts a mean comment about a classmate.", { kind: "choose", prompt: "Best choice?", options: ["Like the comment", "Tell a trusted adult and support your classmate", "Ignore it forever"], answer: "Tell a trusted adult and support your classmate" }),
      ],
      questions: [
        mc("What is an upstander?", ["Someone who helps when others are treated unkindly", "Someone who stands up in class", "A type of computer"], "Someone who helps when others are treated unkindly", "Upstanders take safe action to help."),
        tf("Messages you post online can be screenshotted and shared.", true, "That's why it's important to think before you post."),
        fill("Before you post, you should ______ first.", "think", "Think before you post!", ["think about it"]),
      ],
    },
  ],
});

const creativeWriting = buildCourse({
  id: "creative-writing",
  title: "Creative Writing",
  description: "Invent unforgettable characters, paint vivid settings and structure stories with a strong beginning, middle and end.",
  thumbnailEmoji: "✏️",
  category: "writing",
  difficulty: "beginner",
  estimatedMinutes: 35,
  ageRange: { min: 9, max: 16 },
  organizationId: "org-public-library",
  authorId: "contrib-partner",
  status: "published",
  version: 1,
  source: "official",
  updatedAt: SEED_DATE,
  lessons: [
    {
      slug: "characters",
      title: "Building a Character",
      sections: [
        explain("What makes a character memorable", "Great characters want something, have a problem in the way, and have a quirk that makes them unique, like a dragon who is afraid of fire."),
        example("Character card", "Name: Zuri. Wants: to win the science fair. Problem: her volcano won't erupt. Quirk: talks to her plants."),
        challenge("Practice challenge", "Create a character card: name, what they want, their problem, and one quirk.", "Start with what they want most.", "Any answer that includes all four parts is great!"),
      ],
      questions: [
        mc("Which detail makes a character more interesting?", ["A goal and a problem", "Their shoe size only", "Nothing at all"], "A goal and a problem", "Wanting something and facing obstacles creates a story."),
        tf("A quirk is a special or unusual trait.", true, "Quirks make characters unique and memorable."),
        fill("The thing that stands in a character's way is the ______.", "problem", "Problems (or conflicts) drive stories forward.", ["conflict", "obstacle"]),
      ],
    },
    {
      slug: "setting",
      title: "Setting the Scene",
      sections: [
        explain("Use your five senses", "Describe what characters see, hear, smell, taste and feel to make readers feel like they're there."),
        example("Show, don't tell", "Instead of \"the kitchen was nice\", write \"the kitchen smelled like cinnamon, and the oven hummed a warm song.\""),
        exercise("Sense check", "\"The waves crashed and the salty wind stung my cheeks.\"", { kind: "choose", prompt: "Which senses are used?", options: ["Hearing and touch", "Taste only", "Sight only"], answer: "Hearing and touch" }),
      ],
      questions: [
        mc("Which sentence shows instead of tells?", ["The forest was scary.", "Twigs snapped behind me and cold fog curled around my ankles."], "Twigs snapped behind me and cold fog curled around my ankles.", "It uses sounds and feelings to show the forest is scary."),
        tf("The setting is when and where a story happens.", true, "Setting = time + place."),
        fill("Writers use the five ______ to describe settings.", "senses", "Sight, hearing, smell, taste and touch."),
      ],
    },
    {
      slug: "story-structure",
      title: "Beginning, Middle, End",
      sections: [
        analogy("A story is a roller coaster", "The beginning climbs the hill (meet the character), the middle is the big drop (the problem gets bigger), and the end is the ride slowing down (the problem is solved)."),
        explain("Three parts", "Beginning: introduce character and setting. Middle: the problem grows. End: the problem is solved and the character has changed."),
        challenge("Practice challenge", "Write one sentence for each part of a story about a lost puppy.", "Beginning: who? Middle: what goes wrong? End: how is it fixed?", "Example: Max lost his puppy at the park. He searched everywhere as it got dark. A kind neighbor found her by the pond."),
      ],
      questions: [
        mc("Where does the problem usually get bigger?", ["Beginning", "Middle", "End"], "Middle", "The middle is where tension builds."),
        tf("The ending is where the problem gets solved.", true, "Endings resolve the main problem."),
        mc("What usually happens in the beginning?", ["Meet the character and setting", "The problem is solved", "The credits roll"], "Meet the character and setting", "Beginnings introduce who, where and when."),
      ],
    },
  ],
});

export const SEED_COURSES: Course[] = [codeAdventure, mathQuest, scienceExplorer, digitalCitizenship, creativeWriting];

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { dayKey, randomInt, type WidgetProps } from "../kit";

const QUOTES: [string, string][] = [
	["The best way out is always through.", "Robert Frost"],
	[
		"We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
		"Will Durant",
	],
	["The unexamined life is not worth living.", "Socrates"],
	["The only thing we have to fear is fear itself.", "Franklin D. Roosevelt"],
	["Not all those who wander are lost.", "J.R.R. Tolkien"],
	["Do or do not. There is no try.", "Yoda"],
	["Stay hungry, stay foolish.", "Steve Jobs"],
	["The only way to do great work is to love what you do.", "Steve Jobs"],
	["Premature optimization is the root of all evil.", "Donald Knuth"],
	["Talk is cheap. Show me the code.", "Linus Torvalds"],
	[
		"Simple things should be simple, complex things should be possible.",
		"Alan Kay",
	],
	["The best way to predict the future is to invent it.", "Alan Kay"],
	[
		"Programs must be written for people to read, and only incidentally for machines to execute.",
		"Harold Abelson",
	],
	[
		"Any sufficiently advanced technology is indistinguishable from magic.",
		"Arthur C. Clarke",
	],
	["“Hope” is the thing with feathers.", "Emily Dickinson"],
	["The journey of a thousand miles begins with a single step.", "Lao Tzu"],
	["Well done is better than well said.", "Benjamin Franklin"],
	[
		"Waste no more time arguing about what a good man should be. Be one.",
		"Marcus Aurelius",
	],
	[
		"The impediment to action advances action. What stands in the way becomes the way.",
		"Marcus Aurelius",
	],
	[
		"Dwell on the beauty of life. Watch the stars, and see yourself running with them.",
		"Marcus Aurelius",
	],
	["We suffer more often in imagination than in reality.", "Seneca"],
	[
		"Nothing in life is to be feared, it is only to be understood.",
		"Marie Curie",
	],
	["Imagination is more important than knowledge.", "Albert Einstein"],
	[
		"Life is like riding a bicycle. To keep your balance, you must keep moving.",
		"Albert Einstein",
	],
	["Make it work, make it right, make it fast.", "Kent Beck"],
	[
		"There are only two hard things in Computer Science: cache invalidation and naming things.",
		"Phil Karlton",
	],
	["Simplicity is prerequisite for reliability.", "Edsger W. Dijkstra"],
	[
		"Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.",
		"Antoine de Saint-Exupéry",
	],
	[
		"I can't go back to yesterday because I was a different person then.",
		"Lewis Carroll",
	],
	[
		"If you want to go fast, go alone. If you want to go far, go together.",
		"Proverb",
	],
	["Fall seven times, stand up eight.", "Japanese proverb"],
	[
		"The best time to plant a tree was twenty years ago. The second best time is now.",
		"Proverb",
	],
	["Slow is smooth, and smooth is fast.", "Proverb"],
	[
		"A ship in harbor is safe, but that is not what ships are built for.",
		"John A. Shedd",
	],
	["What I cannot create, I do not understand.", "Richard Feynman"],
	[
		"The first principle is that you must not fool yourself, and you are the easiest person to fool.",
		"Richard Feynman",
	],
	["We are a way for the cosmos to know itself.", "Carl Sagan"],
	["Rest is not idleness.", "John Lubbock"],
	[
		"Almost everything will work again if you unplug it for a few minutes, including you.",
		"Anne Lamott",
	],
	["I think, therefore I am.", "René Descartes"],
];

/** Same quote all day for everyone; tap for another. */
const daily = () => {
	const key = dayKey();
	let hash = 0;
	for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return hash % QUOTES.length;
};

export default function Quote(_: WidgetProps<object>) {
	const [index, setIndex] = useState(daily);
	const [text, author] = QUOTES[index];
	return (
		<figure className="group/quote relative space-y-2 py-1">
			<blockquote className="text-base leading-snug font-medium text-balance">
				“{text.replace(/^“|”$/g, "")}”
			</blockquote>
			<figcaption className="text-sm text-muted">— {author}</figcaption>
			<button
				type="button"
				aria-label="Another quote"
				onClick={() =>
					setIndex(
						(current) =>
							(current + 1 + randomInt(QUOTES.length - 1)) % QUOTES.length,
					)
				}
				className="icon-btn absolute right-0 bottom-0 size-7 opacity-0 group-hover/quote:opacity-100 pointer-coarse:opacity-100"
			>
				<RefreshCw className="size-3.5" />
			</button>
		</figure>
	);
}

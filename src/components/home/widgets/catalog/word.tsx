import { Volume2 } from "lucide-react";
import { dayKey, type WidgetProps } from "../kit";

const WORDS: [string, string, string][] = [
	["serendipity", "noun", "Finding something good without looking for it."],
	["ephemeral", "adjective", "Lasting for a very short time."],
	["petrichor", "noun", "The pleasant smell of rain on dry earth."],
	["mellifluous", "adjective", "Sweet and smooth to hear."],
	["sanguine", "adjective", "Optimistic, especially when things look bad."],
	["ebullient", "adjective", "Cheerful and full of energy."],
	["laconic", "adjective", "Using very few words."],
	["ineffable", "adjective", "Too great to be expressed in words."],
	["halcyon", "adjective", "Calm, peaceful and happy, usually of the past."],
	["quixotic", "adjective", "Idealistic in an unrealistic, impractical way."],
	["luminous", "adjective", "Giving off light; bright or shining."],
	["solace", "noun", "Comfort in a time of sadness."],
	["ubiquitous", "adjective", "Seeming to be everywhere at once."],
	["epiphany", "noun", "A sudden, striking realization."],
	["labyrinthine", "adjective", "Complicated and confusing, like a maze."],
	["lucid", "adjective", "Clearly expressed and easy to understand."],
	["panacea", "noun", "A solution for all problems."],
	["perspicacious", "adjective", "Quick to notice and understand things."],
	["quintessential", "adjective", "The most perfect example of something."],
	["ruminate", "verb", "To think deeply about something for a long time."],
	["sagacious", "adjective", "Wise and showing good judgment."],
	["tenacious", "adjective", "Holding firmly; not giving up easily."],
	["vicarious", "adjective", "Felt through the experiences of someone else."],
	["whimsical", "adjective", "Playfully quaint or fanciful."],
	["zenith", "noun", "The highest point reached."],
	["aplomb", "noun", "Calm self-confidence in a difficult situation."],
	["bucolic", "adjective", "Relating to the pleasant side of country life."],
	["cacophony", "noun", "A harsh mixture of loud sounds."],
	["effervescent", "adjective", "Bubbly; lively and enthusiastic."],
	["gregarious", "adjective", "Fond of company; sociable."],
	["idyllic", "adjective", "Extremely happy, peaceful or picturesque."],
	["juxtapose", "verb", "To place side by side for contrast."],
	["kismet", "noun", "Destiny; fate."],
	[
		"magnanimous",
		"adjective",
		"Generous and forgiving, especially to a rival.",
	],
	["nefarious", "adjective", "Wicked or criminal."],
	["obfuscate", "verb", "To make something unclear on purpose."],
	["plethora", "noun", "A large or excessive amount."],
	["raconteur", "noun", "Someone who tells stories in an entertaining way."],
	["sobriquet", "noun", "A nickname."],
	["tranquil", "adjective", "Free from disturbance; calm."],
	["verisimilitude", "noun", "The appearance of being true or real."],
	["wanderlust", "noun", "A strong desire to travel."],
	["nostalgia", "noun", "A sentimental longing for the past."],
	["eloquent", "adjective", "Fluent and persuasive in speaking or writing."],
	["resilient", "adjective", "Able to recover quickly from difficulty."],
];

export default function Word(_: WidgetProps<object>) {
	const day = Math.floor(new Date(`${dayKey()}T12:00`).getTime() / 86_400_000);
	const [word, kind, meaning] = WORDS[day % WORDS.length];
	return (
		<div className="space-y-1 py-1">
			<div className="flex items-center gap-2">
				<p className="text-2xl font-semibold">{word}</p>
				<button
					type="button"
					className="icon-btn size-7"
					aria-label={`Say ${word}`}
					onClick={() =>
						speechSynthesis.speak(new SpeechSynthesisUtterance(word))
					}
				>
					<Volume2 className="size-4" />
				</button>
			</div>
			<p className="text-xs text-muted italic">{kind}</p>
			<p className="text-sm">{meaning}</p>
		</div>
	);
}

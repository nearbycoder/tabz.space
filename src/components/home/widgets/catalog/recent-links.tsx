import { ago, Hint, type WidgetProps } from "../kit";
import { LinkRow, useLibraryLinks } from "../links";

type Data = { count: number };

export default function RecentLinks({ data }: WidgetProps<Data>) {
	const links = useLibraryLinks()
		.sort(
			(a, b) =>
				new Date(b.link.createdAt).getTime() -
				new Date(a.link.createdAt).getTime(),
		)
		.slice(0, Math.min(20, Math.max(1, data.count || 8)));
	if (!links.length) return <Hint>Save some links first</Hint>;
	return (
		<div className="space-y-0.5">
			{links.map(({ link }) => (
				<LinkRow
					key={link.id}
					link={link}
					aside={ago(new Date(link.createdAt).getTime())}
				/>
			))}
		</div>
	);
}

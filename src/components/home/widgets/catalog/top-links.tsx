import { Hint, type WidgetProps } from "../kit";
import { LinkRow, useLibraryLinks } from "../links";

type Data = { count: number };

export default function TopLinks({ data }: WidgetProps<Data>) {
	const links = useLibraryLinks()
		.filter(({ link }) => link.visitCount > 0)
		.sort((a, b) => b.link.visitCount - a.link.visitCount)
		.slice(0, Math.min(20, Math.max(1, data.count || 8)));
	if (!links.length)
		return <Hint>Open a few links and they'll show up here</Hint>;
	return (
		<div className="space-y-0.5">
			{links.map(({ link }) => (
				<LinkRow key={link.id} link={link} aside={link.visitCount} />
			))}
		</div>
	);
}

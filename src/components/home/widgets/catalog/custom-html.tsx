import { Hint, type JsonValue, type WidgetProps } from "../kit";
import { SandboxFrame } from "../SandboxFrame";

type Data = { html: string; state: JsonValue };

export default function CustomHtml({
	data,
	save,
	readOnly,
}: WidgetProps<Data>) {
	if (!data.html.trim())
		return <Hint>Add some code in the widget's settings</Hint>;
	return (
		<SandboxFrame
			html={data.html}
			state={data.state}
			onState={readOnly ? undefined : (state) => save({ ...data, state })}
		/>
	);
}

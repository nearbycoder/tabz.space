import {
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Mouse drags start after a small move; touch drags need a short press-and-hold,
 * so swiping still scrolls the page on phones.
 */
export function useDragSensors() {
	return useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 250, tolerance: 8 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
}

/** A light tap of haptic feedback where supported (Android). */
export const buzz = () => navigator.vibrate?.(8);

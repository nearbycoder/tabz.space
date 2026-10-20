import {
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// Module constants on purpose: useSensor memoizes on the options object, and
// fresh literals each render handed dnd-kit new sensors every time, which
// re-rendered every draggable tile on the board on any update.
const MOUSE = { activationConstraint: { distance: 6 } };
const TOUCH = { activationConstraint: { delay: 250, tolerance: 8 } };
const KEYBOARD = { coordinateGetter: sortableKeyboardCoordinates };

/**
 * Mouse drags start after a small move; touch drags need a short press-and-hold,
 * so swiping still scrolls the page on phones.
 */
export function useDragSensors() {
	return useSensors(
		useSensor(MouseSensor, MOUSE),
		useSensor(TouchSensor, TOUCH),
		useSensor(KeyboardSensor, KEYBOARD),
	);
}

/** A light tap of haptic feedback where supported (Android). */
export const buzz = () => navigator.vibrate?.(8);

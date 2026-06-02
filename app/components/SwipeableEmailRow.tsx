import { useRef } from "react";

interface SwipeableEmailRowProps {
	children: React.ReactNode;
	onSwipeRight: () => void;
	onSwipeLeft: () => void;
}

export function SwipeableEmailRow({ children, onSwipeRight, onSwipeLeft }: SwipeableEmailRowProps) {
	const startX = useRef<number | null>(null);

	const handleTouchStart = (e: React.TouchEvent) => {
		startX.current = e.touches[0].clientX;
	};

	const handleTouchEnd = (e: React.TouchEvent) => {
		if (startX.current === null) return;
		const delta = e.changedTouches[0].clientX - startX.current;
		startX.current = null;
		if (delta > 60) onSwipeRight();
		else if (delta < -60) onSwipeLeft();
	};

	return (
		<div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
			{children}
		</div>
	);
}

/**
 * Format a date to show time elapsed from now in a strict format
 * Similar to date-fns formatDistanceToNowStrict
 */
export function formatDistanceToNowStrict(
	date: Date,
	options: { addSuffix?: boolean } = {},
): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);
	const diffWeeks = Math.floor(diffDays / 7);
	const diffMonths = Math.floor(diffDays / 30);
	const diffYears = Math.floor(diffDays / 365);

	let result: string;

	if (diffYears > 0) {
		result = `${diffYears} year${diffYears === 1 ? "" : "s"}`;
	} else if (diffMonths > 0) {
		result = `${diffMonths} month${diffMonths === 1 ? "" : "s"}`;
	} else if (diffWeeks > 0) {
		result = `${diffWeeks} week${diffWeeks === 1 ? "" : "s"}`;
	} else if (diffDays > 0) {
		result = `${diffDays} day${diffDays === 1 ? "" : "s"}`;
	} else if (diffHours > 0) {
		result = `${diffHours} hour${diffHours === 1 ? "" : "s"}`;
	} else if (diffMinutes > 0) {
		result = `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
	} else {
		result = `${diffSeconds} second${diffSeconds === 1 ? "" : "s"}`;
	}

	return options.addSuffix ? `${result} ago` : result;
}

/**
 * Get the time of day label for a given date
 */
export function getTimeOfDayLabel(date: Date) {
	const hour = date.getHours();
	if (hour >= 5 && hour < 12) {
		return "this morning";
	}
	if (hour >= 12 && hour < 17) {
		return "this afternoon";
	}
	if (hour >= 17 && hour < 21) {
		return "this evening";
	}
	return "tonight";
}

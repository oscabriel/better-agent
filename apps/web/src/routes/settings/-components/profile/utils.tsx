import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";

export function getDeviceIcon(userAgent?: string | null) {
	if (!userAgent) return <Monitor className="h-4 w-4" />;

	if (userAgent.toLowerCase().includes("mobile")) {
		return <Smartphone className="h-4 w-4" />;
	}
	if (userAgent.toLowerCase().includes("tablet")) {
		return <Tablet className="h-4 w-4" />;
	}
	return <Laptop className="h-4 w-4" />;
}

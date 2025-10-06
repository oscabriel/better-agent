export type User = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
};

export type Session = {
	id: string;
	token: string;
	userAgent?: string | null;
	[key: string]: unknown;
};

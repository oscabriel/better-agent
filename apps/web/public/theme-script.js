(() => {
	const STORAGE_KEY = "better-chat-theme";
	const SOURCE_KEY = "better-chat-theme-source";
	const SOURCE_MANUAL = "manual";
	const SOURCE_SYSTEM = "system";
	const THEME_LIGHT = "light";
	const THEME_DARK = "dark";
	const BACKGROUND = {
		light: "oklch(0.985 0 0)",
		dark: "oklch(0.145 0 0)",
	};

	const root = document.documentElement;
	const systemMedia = window.matchMedia("(prefers-color-scheme: dark)");

	const readStoredTheme = () => {
		try {
			const value = window.localStorage.getItem(STORAGE_KEY);
			return value === THEME_LIGHT || value === THEME_DARK ? value : null;
		} catch {
			return null;
		}
	};

	const readThemeSource = () => {
		try {
			const value = window.localStorage.getItem(SOURCE_KEY);
			return value === SOURCE_MANUAL ? SOURCE_MANUAL : SOURCE_SYSTEM;
		} catch {
			return SOURCE_SYSTEM;
		}
	};

	const writeThemeSource = (source) => {
		try {
			window.localStorage.setItem(SOURCE_KEY, source);
		} catch {}
	};

	const clearStoredTheme = () => {
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {}
	};

	const writeStoredTheme = (theme) => {
		try {
			window.localStorage.setItem(STORAGE_KEY, theme);
		} catch {}
	};

	const getSystemTheme = () => (systemMedia.matches ? THEME_DARK : THEME_LIGHT);

	const applyTheme = (theme, source) => {
		root.classList.remove(THEME_LIGHT, THEME_DARK);
		root.classList.add(theme);
		root.dataset.theme = theme;
		root.dataset.themeSource = source;
		root.style.colorScheme = theme === THEME_DARK ? "dark" : "light";
		root.style.backgroundColor = BACKGROUND[theme];
	};

	const dispatchSync = (theme, source) => {
		window.dispatchEvent(
			new CustomEvent("better-chat:theme-sync", {
				detail: { theme, source },
			}),
		);
	};

	const storedTheme = readStoredTheme();
	let storedSource = readThemeSource();

	if (storedSource === SOURCE_MANUAL && !storedTheme) {
		storedSource = SOURCE_SYSTEM;
	}

	const systemTheme = getSystemTheme();
	const initialSource = storedSource;
	const initialTheme =
		initialSource === SOURCE_MANUAL && storedTheme ? storedTheme : systemTheme;

	applyTheme(initialTheme, initialSource);

	if (initialSource === SOURCE_MANUAL) {
		writeStoredTheme(initialTheme);
	} else {
		clearStoredTheme();
	}

	writeThemeSource(initialSource);
	dispatchSync(initialTheme, initialSource);

	const handleSystemChange = (event) => {
		if (readThemeSource() === SOURCE_MANUAL) return;

		const nextTheme = event.matches ? THEME_DARK : THEME_LIGHT;

		applyTheme(nextTheme, SOURCE_SYSTEM);
		clearStoredTheme();
		writeThemeSource(SOURCE_SYSTEM);
		dispatchSync(nextTheme, SOURCE_SYSTEM);
	};

	if (typeof systemMedia.addEventListener === "function") {
		systemMedia.addEventListener("change", handleSystemChange);
	} else if (typeof systemMedia.addListener === "function") {
		systemMedia.addListener(handleSystemChange);
	}
})();

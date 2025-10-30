export function FeatureCards() {
	return (
		<div className="mx-auto w-full max-w-6xl">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<FeatureCard
					icon={<MultiModelIcon />}
					title="Multi-Model Support"
					description="Support for dozens of AI models from top providers."
				/>
				<FeatureCard
					icon={<MCPIcon />}
					title="Built-in MCPs"
					description="Comes with the best MCP servers for chatting with docs."
				/>
				<FeatureCard
					icon={<DurableObjectsIcon />}
					title="Data Isolation"
					description="Your chat data lives in your own fast, isolated database."
				/>
				<FeatureCard
					icon={<BYOKIcon />}
					title="Bring Your Own Key"
					description="Use your own API keys for any model, with no limits."
				/>
			</div>
		</div>
	);
}

function FeatureCard({
	icon,
	title,
	description,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<div className="group relative overflow-hidden border-2 border-border/50 bg-linear-to-br from-white/60 to-white/40 p-6 backdrop-blur-sm transition-all hover:border-orange-500/50 dark:from-black/30 dark:to-black/20">
			<div className="mb-6 flex h-64 items-center justify-center border border-border/30 bg-black/5 dark:bg-white/5">
				{icon}
			</div>
			<h3 className="mb-3 font-bold font-mono text-base uppercase tracking-widest">
				{title}
			</h3>
			<p className="font-mono text-muted-foreground text-xs leading-relaxed">
				{description}
			</p>
		</div>
	);
}

function MultiModelIcon() {
	return (
		<div className="relative h-full w-full p-4">
			<svg
				className="h-full w-full"
				viewBox="0 0 200 200"
				role="img"
				aria-label="Multi-model support diagram"
			>
				{/* Grid background */}
				<defs>
					<pattern
						id="grid"
						width="20"
						height="20"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 20 0 L 0 0 0 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="0.5"
							className="text-border"
						/>
					</pattern>
				</defs>
				<rect width="200" height="200" fill="url(#grid)" opacity="0.3" />

				{/* Central hub */}
				<circle
					cx="100"
					cy="100"
					r="18"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					className="text-orange-500"
				/>
				<circle
					cx="100"
					cy="100"
					r="12"
					fill="currentColor"
					className="text-orange-500"
				>
					<animate
						attributeName="opacity"
						values="1;0.5;1"
						dur="2s"
						repeatCount="indefinite"
					/>
				</circle>

				{/* Input nodes */}
				{[
					{ x: 40, y: 40, delay: "0s", id: "node-1" },
					{ x: 160, y: 40, delay: "0.4s", id: "node-2" },
					{ x: 40, y: 160, delay: "0.8s", id: "node-3" },
					{ x: 160, y: 160, delay: "1.2s", id: "node-4" },
				].map((node) => (
					<g key={node.id}>
						<line
							x1={node.x}
							y1={node.y}
							x2="100"
							y2="100"
							stroke="currentColor"
							strokeWidth="2.5"
							className="text-orange-500/30"
							strokeDasharray="150"
						>
							<animate
								attributeName="stroke-dashoffset"
								values="150;0;-150"
								dur="3s"
								begin={node.delay}
								repeatCount="indefinite"
							/>
						</line>
						<rect
							x={node.x - 8}
							y={node.y - 8}
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							strokeWidth="3"
							className="text-border"
						>
							<animate
								attributeName="opacity"
								values="0.5;1;0.5"
								dur="2s"
								begin={node.delay}
								repeatCount="indefinite"
							/>
						</rect>
					</g>
				))}

				{/* Crosshair */}
				<line
					x1="80"
					y1="100"
					x2="92"
					y2="100"
					stroke="currentColor"
					strokeWidth="2"
					className="text-orange-500/50"
				/>
				<line
					x1="108"
					y1="100"
					x2="120"
					y2="100"
					stroke="currentColor"
					strokeWidth="2"
					className="text-orange-500/50"
				/>
				<line
					x1="100"
					y1="80"
					x2="100"
					y2="92"
					stroke="currentColor"
					strokeWidth="2"
					className="text-orange-500/50"
				/>
				<line
					x1="100"
					y1="108"
					x2="100"
					y2="120"
					stroke="currentColor"
					strokeWidth="2"
					className="text-orange-500/50"
				/>
			</svg>
		</div>
	);
}

function MCPIcon() {
	return (
		<div className="relative h-full w-full p-4">
			<svg
				className="h-full w-full"
				viewBox="0 0 200 200"
				role="img"
				aria-label="MCP tool call with streaming output"
			>
				{/* Grid background */}
				<defs>
					<pattern
						id="grid-mcp"
						width="20"
						height="20"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 20 0 L 0 0 0 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="0.5"
							className="text-border"
						/>
					</pattern>
				</defs>
				<rect width="200" height="200" fill="url(#grid-mcp)" opacity="0.3" />

				{/* Single Tool Call Card */}
				<g>
					{/* Card background */}
					<rect
						x="20"
						y="50"
						width="160"
						height="32"
						fill="currentColor"
						className="text-muted/20 dark:text-muted/10"
						rx="3"
					/>

					{/* Left accent bar - orange */}
					<rect x="20" y="50" width="4" height="32" fill="#f97316" rx="1.5" />

					{/* Tool name */}
					<text
						x="30"
						y="69"
						className="fill-current font-bold font-mono text-[11px] text-foreground"
					>
						read_docs
					</text>

					{/* Status badge */}
					<rect
						x="95"
						y="58"
						width="42"
						height="15"
						rx="2"
						fill="#f97316"
						opacity="0.9"
					/>
					<text
						x="116"
						y="69"
						textAnchor="middle"
						className="fill-white font-bold font-mono text-[8px]"
					>
						MCP
					</text>

					{/* Chevron pointing down */}
					<path
						d="M 162 63 L 168 69 L 174 63"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="text-muted-foreground"
						opacity="0.6"
					/>
				</g>

				{/* Streaming text lines below */}
				{[
					{ y: 95, width: 150, id: "line-1", delay: 0 },
					{ y: 108, width: 145, id: "line-2", delay: 0.3 },
					{ y: 121, width: 155, id: "line-3", delay: 0.6 },
					{ y: 134, width: 130, id: "line-4", delay: 0.9 },
					{ y: 147, width: 140, id: "line-5", delay: 1.2 },
					{ y: 160, width: 148, id: "line-6", delay: 1.5 },
				].map((line) => (
					<rect
						key={line.id}
						x="30"
						y={line.y}
						height="6"
						rx="1.5"
						fill="#c2410c"
						opacity="0"
					>
						<animate
							attributeName="width"
							values={`0;${line.width};${line.width};${line.width};0`}
							dur="6s"
							begin={`${line.delay}s`}
							repeatCount="indefinite"
							keyTimes="0;0.15;0.6;0.8;1"
						/>
						<animate
							attributeName="opacity"
							values="0;0.3;0.3;0.3;0"
							dur="6s"
							begin={`${line.delay}s`}
							repeatCount="indefinite"
							keyTimes="0;0.1;0.6;0.8;1"
						/>
						<animate
							attributeName="fill"
							values="#c2410c;#6b7280;#6b7280;#6b7280;#c2410c"
							dur="6s"
							begin={`${line.delay}s`}
							repeatCount="indefinite"
							keyTimes="0;0.15;0.6;0.8;1"
						/>
					</rect>
				))}
			</svg>
		</div>
	);
}

function DurableObjectsIcon() {
	return (
		<div className="relative h-full w-full p-4">
			<svg
				className="h-full w-full"
				viewBox="0 0 200 200"
				role="img"
				aria-label="Per-user data isolation with Durable Objects"
			>
				{/* Grid background */}
				<defs>
					<pattern
						id="grid-do"
						width="20"
						height="20"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 20 0 L 0 0 0 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="0.5"
							className="text-border"
						/>
					</pattern>
				</defs>
				<rect width="200" height="200" fill="url(#grid-do)" opacity="0.3" />

				{/* Central AI box - positioned in middle */}
				<rect
					x="75"
					y="90"
					width="50"
					height="35"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					className="text-orange-500"
					rx="3"
				/>
				<text
					x="100"
					y="113"
					textAnchor="middle"
					className="fill-current font-bold font-mono text-base text-orange-500"
				>
					AI
				</text>

				{/* User DOs above AI - data flows upward */}
				{[
					{ x: 40, y: 35, label: "1", id: "user-1" },
					{ x: 100, y: 35, label: "2", id: "user-2" },
					{ x: 160, y: 35, label: "3", id: "user-3" },
				].map((user) => {
					const startX = 100;
					const startY = 90;

					return (
						<g key={user.id}>
							{/* Connection line */}
							<line
								x1={startX}
								y1={startY}
								x2={user.x}
								y2={user.y}
								stroke="currentColor"
								strokeWidth="2"
								className="text-orange-500/30"
								strokeDasharray="4,4"
							>
								<animate
									attributeName="stroke-dashoffset"
									from="0"
									to="8"
									dur="1.5s"
									repeatCount="indefinite"
								/>
							</line>

							{/* Flowing data particle */}
							<circle r="3" fill="currentColor" className="text-orange-500">
								<animateMotion
									dur="2s"
									repeatCount="indefinite"
									begin={`${(Number.parseInt(user.label, 10) - 1) * 0.3}s`}
								>
									<mpath href={`#path-${user.id}`} />
								</animateMotion>
							</circle>
							<path
								id={`path-${user.id}`}
								d={`M ${startX} ${startY} L ${user.x} ${user.y}`}
								fill="none"
								stroke="none"
							/>

							{/* User DO container */}
							<rect
								x={user.x - 18}
								y={user.y - 15}
								width="36"
								height="30"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								className="text-border"
								rx="2"
							>
								<animate
									attributeName="opacity"
									values="0.5;1;0.5"
									dur="2s"
									begin={`${(Number.parseInt(user.label, 10) - 1) * 0.3}s`}
									repeatCount="indefinite"
								/>
							</rect>
							<text
								x={user.x}
								y={user.y + 4}
								textAnchor="middle"
								className="fill-current font-bold font-mono text-[10px] text-foreground"
							>
								DO
							</text>
							<text
								x={user.x}
								y={user.y - 22}
								textAnchor="middle"
								className="fill-current font-mono text-[9px] text-muted-foreground"
							>
								U{user.label}
							</text>
						</g>
					);
				})}

				{/* User DOs below AI - data flows downward */}
				{[
					{ x: 40, y: 170, label: "4", id: "user-4" },
					{ x: 100, y: 170, label: "5", id: "user-5" },
					{ x: 160, y: 170, label: "6", id: "user-6" },
				].map((user) => {
					const startX = 100;
					const startY = 125;

					return (
						<g key={user.id}>
							{/* Connection line */}
							<line
								x1={startX}
								y1={startY}
								x2={user.x}
								y2={user.y}
								stroke="currentColor"
								strokeWidth="2"
								className="text-orange-500/30"
								strokeDasharray="4,4"
							>
								<animate
									attributeName="stroke-dashoffset"
									from="0"
									to="8"
									dur="1.5s"
									repeatCount="indefinite"
								/>
							</line>

							{/* Flowing data particle */}
							<circle r="3" fill="currentColor" className="text-orange-500">
								<animateMotion
									dur="2s"
									repeatCount="indefinite"
									begin={`${(Number.parseInt(user.label, 10) - 4) * 0.3}s`}
								>
									<mpath href={`#path-${user.id}`} />
								</animateMotion>
							</circle>
							<path
								id={`path-${user.id}`}
								d={`M ${startX} ${startY} L ${user.x} ${user.y}`}
								fill="none"
								stroke="none"
							/>

							{/* User DO container */}
							<rect
								x={user.x - 18}
								y={user.y - 15}
								width="36"
								height="30"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								className="text-border"
								rx="2"
							>
								<animate
									attributeName="opacity"
									values="0.5;1;0.5"
									dur="2s"
									begin={`${(Number.parseInt(user.label, 10) - 4) * 0.3}s`}
									repeatCount="indefinite"
								/>
							</rect>
							<text
								x={user.x}
								y={user.y + 4}
								textAnchor="middle"
								className="fill-current font-bold font-mono text-[10px] text-foreground"
							>
								DO
							</text>
							<text
								x={user.x}
								y={user.y - 22}
								textAnchor="middle"
								className="fill-current font-mono text-[9px] text-muted-foreground"
							>
								U{user.label}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

function BYOKIcon() {
	return (
		<div className="relative h-full w-full p-4">
			<svg
				className="h-full w-full"
				viewBox="0 0 200 200"
				role="img"
				aria-label="Bring your own API key security"
			>
				{/* Grid background */}
				<defs>
					<pattern
						id="grid-byok"
						width="20"
						height="20"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 20 0 L 0 0 0 20"
							fill="none"
							stroke="currentColor"
							strokeWidth="0.5"
							className="text-border"
						/>
					</pattern>
				</defs>
				<rect width="200" height="200" fill="url(#grid-byok)" opacity="0.3" />

				{/* Lock body */}
				<rect
					x="70"
					y="95"
					width="60"
					height="60"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					className="text-orange-500"
				/>

				{/* Lock shackle */}
				<path
					d="M 82 95 L 82 75 Q 82 60, 100 60 Q 118 60, 118 75 L 118 95"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					className="text-orange-500"
				/>

				{/* Keyhole */}
				<circle
					cx="100"
					cy="118"
					r="7"
					fill="currentColor"
					className="text-orange-500"
				>
					<animate
						attributeName="opacity"
						values="0.5;1;0.5"
						dur="2s"
						repeatCount="indefinite"
					/>
				</circle>
				<rect
					x="96"
					y="125"
					width="8"
					height="16"
					fill="currentColor"
					className="text-orange-500"
				>
					<animate
						attributeName="opacity"
						values="0.5;1;0.5"
						dur="2s"
						repeatCount="indefinite"
					/>
				</rect>

				{/* Security scanning rings */}
				{[1, 2, 3].map((i) => (
					<circle
						key={i}
						cx="100"
						cy="125"
						r={35 + i * 18}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="text-orange-500/30"
						strokeDasharray="6,6"
					>
						<animate
							attributeName="r"
							values={`${35 + i * 18};${50 + i * 18};${35 + i * 18}`}
							dur="4s"
							begin={`${i * 0.5}s`}
							repeatCount="indefinite"
						/>
						<animate
							attributeName="opacity"
							values="0;0.6;0"
							dur="4s"
							begin={`${i * 0.5}s`}
							repeatCount="indefinite"
						/>
					</circle>
				))}

				{/* Corner brackets */}
				<path
					d="M 55 55 L 45 55 L 45 65"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					className="text-border"
				/>
				<path
					d="M 145 55 L 155 55 L 155 65"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					className="text-border"
				/>
				<path
					d="M 55 170 L 45 170 L 45 160"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					className="text-border"
				/>
				<path
					d="M 145 170 L 155 170 L 155 160"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					className="text-border"
				/>
			</svg>
		</div>
	);
}

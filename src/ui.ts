export function renderPage(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Portfolio Monitor Assistant</title>
	<style>
		:root {
			color-scheme: dark light;
			font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			background: #0b0d10;
			color: #f2f5f9;
		}
		body {
			margin: 0;
			padding: 0;
			background: radial-gradient(circle at top left, #1b2a45, #080b12);
			min-height: 100vh;
		}
		header {
			padding: 2rem 1.5rem 1rem;
			text-align: center;
		}
		header h1 {
			margin: 0;
			font-size: clamp(2rem, 3vw, 3rem);
			letter-spacing: 0.08em;
		}
		main {
			max-width: 1100px;
			margin: 0 auto;
			padding: 0 1.5rem 4rem;
			display: grid;
			gap: 1.5rem;
		}
		.sr-only {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			border: 0;
		}
		section {
			background: rgba(10, 14, 20, 0.75);
			border: 1px solid rgba(255, 255, 255, 0.07);
			border-radius: 18px;
			padding: 1.5rem;
			backdrop-filter: blur(12px);
			box-shadow: 0 16px 40px rgba(11, 17, 25, 0.35);
		}
		#metrics {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 1rem;
		}
		.metric-card {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			background: linear-gradient(140deg, rgba(35, 56, 93, 0.95), rgba(15, 27, 49, 0.95));
			border-radius: 16px;
			padding: 1rem 1.25rem;
			border: 1px solid rgba(255, 255, 255, 0.05);
		}
		.metric-card h2, .metric-card h3 {
			margin: 0;
			font-size: 0.9rem;
			color: rgba(199, 211, 233, 0.8);
			font-weight: 600;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}
		.metric-card p {
			margin: 0;
			font-size: 1.6rem;
			font-weight: 600;
		}
		#chart-container {
			display: grid;
			grid-template-columns: minmax(220px, 320px) 1fr;
			align-items: center;
			gap: 1.5rem;
		}
		#chart-canvas {
			width: 100%;
			height: auto;
			max-width: 320px;
			justify-self: center;
		}
		#chart-legend {
			display: flex;
			flex-direction: column;
			gap: 0.6rem;
		}
		.legend-item {
			display: grid;
			grid-template-columns: 16px 1fr auto;
			align-items: center;
			gap: 0.75rem;
			font-size: 0.95rem;
		}
		.legend-swatch {
			width: 16px;
			height: 16px;
			border-radius: 50%;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.95rem;
		}
		th, td {
			padding: 0.75rem 0.5rem;
			border-bottom: 1px solid rgba(255, 255, 255, 0.05);
			text-align: left;
		}
		th {
			text-transform: uppercase;
			letter-spacing: 0.08em;
			font-size: 0.75rem;
			color: rgba(199, 211, 233, 0.7);
		}
		td.status-ok {
			color: #6ee7a6;
		}
		td.status-error {
			color: #f87171;
		}
		#chat-section {
			display: grid;
			gap: 1rem;
		}
		#chat-log {
			background: rgba(12, 18, 28, 0.8);
			border: 1px solid rgba(255, 255, 255, 0.05);
			border-radius: 14px;
			max-height: 360px;
			overflow-y: auto;
			padding: 1rem;
			display: flex;
			flex-direction: column;
			gap: 1rem;
		}
		.chat-entry {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}
		.chat-entry[data-role="user"] .chat-bubble {
			align-self: flex-end;
			background: linear-gradient(135deg, rgba(76, 165, 255, 0.85), rgba(53, 120, 255, 0.85));
			color: #0b0f17;
		}
		.chat-entry[data-role="assistant"] .chat-bubble {
			align-self: flex-start;
			background: rgba(26, 36, 53, 0.9);
			color: #dfe7ff;
		}
		.chat-bubble {
			padding: 0.85rem 1rem;
			border-radius: 12px;
			line-height: 1.45;
			max-width: 75%;
			white-space: pre-wrap;
			box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
		}
		.chat-meta {
			font-size: 0.75rem;
			color: rgba(199, 211, 233, 0.6);
		}
		form {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 0.75rem;
		}
		textarea {
			background: rgba(11, 16, 25, 0.85);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 14px;
			padding: 0.9rem;
			color: inherit;
			font-family: inherit;
			font-size: 1rem;
			resize: vertical;
			min-height: 80px;
		}
		button {
			background: linear-gradient(135deg, #4cc2ff, #5f5bff);
			border: none;
			border-radius: 14px;
			color: #080b12;
			font-weight: 600;
			font-size: 1rem;
			padding: 0 1.5rem;
			cursor: pointer;
			box-shadow: 0 14px 30px rgba(79, 152, 255, 0.35);
		}
		button:disabled {
			opacity: 0.6;
			cursor: progress;
		}
		@media (max-width: 900px) {
			#chart-container {
				grid-template-columns: 1fr;
			}
			.chat-bubble {
				max-width: 100%;
			}
			form {
				grid-template-columns: 1fr;
			}
			button {
				padding: 0.9rem;
			}
		}
	</style>
</head>
<body>
	<header>
		<h1>Portfolio Monitor Assistant</h1>
		<p>Track blockchain addresses and physical holdings, and adjust them with conversational controls.</p>
	</header>
	<main>
		<section id="metrics" aria-live="polite">
			<div class="metric-card">
				<h2>Total value</h2>
				<p id="total-usd">--</p>
			</div>
			<div class="metric-card">
				<h3>Blockchain</h3>
				<p id="blockchain-share">--</p>
			</div>
			<div class="metric-card">
				<h3>Physical</h3>
				<p id="physical-share">--</p>
			</div>
			<div class="metric-card">
				<h3>Last refresh</h3>
				<p id="last-updated">--</p>
			</div>
		</section>

		<section id="chart-section">
			<h2>Allocation</h2>
			<div id="chart-container">
				<canvas id="chart-canvas" width="320" height="320" role="img" aria-label="Portfolio allocation chart"></canvas>
				<div id="chart-legend"></div>
			</div>
		</section>

		<section id="holdings">
			<h2>Holdings</h2>
			<div style="overflow-x:auto;">
				<table aria-describedby="last-updated">
					<thead>
						<tr>
							<th scope="col">Label</th>
							<th scope="col">Type</th>
							<th scope="col">Quantity</th>
							<th scope="col">Price</th>
							<th scope="col">Value</th>
							<th scope="col">Status</th>
						</tr>
					</thead>
					<tbody id="asset-rows"></tbody>
				</table>
			</div>
		</section>

		<section id="chat-section">
			<h2>Chat Controls</h2>
			<div id="chat-log" aria-live="polite"></div>
			<form id="chat-form">
				<label for="chat-input" class="sr-only">Chat message</label>
				<textarea id="chat-input" placeholder="e.g. Add 2 troy ounces of gold and remove the old bitcoin address" required></textarea>
				<button type="submit">Send</button>
			</form>
		</section>
	</main>
	<script type="module">
		const state = {
			messages: [],
			currencyFormatter: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
			numberFormatter: new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }),
			chartColors: [
				"#5f5bff",
				"#52d6ff",
				"#8bc6ff",
				"#6ee7a6",
				"#f9a8d4",
				"#f97373",
				"#facc15",
			],
		};

		const chatLog = document.getElementById("chat-log");
		const chatForm = document.getElementById("chat-form");
		const chatInput = document.getElementById("chat-input");
		const totalUsdEl = document.getElementById("total-usd");
		const blockchainEl = document.getElementById("blockchain-share");
		const physicalEl = document.getElementById("physical-share");
		const lastUpdatedEl = document.getElementById("last-updated");
		const assetRowsEl = document.getElementById("asset-rows");
		const chartCanvas = document.getElementById("chart-canvas");
		const chartLegend = document.getElementById("chart-legend");

		loadPortfolio();

		chatForm.addEventListener("submit", async (event) => {
			event.preventDefault();
			const text = chatInput.value.trim();
			if (!text) {
				return;
			}
			chatInput.value = "";
			setFormDisabled(true);
			appendChatEntry("user", text);
			state.messages.push({ role: "user", content: text });

			try {
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ messages: state.messages }),
				});

				if (!response.ok) {
					throw new Error("Chat request failed");
				}

				const payload = await response.json();
				const reply = payload.reply ?? "Request processed.";
				appendChatEntry("assistant", buildAssistantReply(reply, payload.operations));
				state.messages.push({ role: "assistant", content: reply });

				if (payload.summary) {
					updatePortfolio(payload.summary);
				}
			} catch (error) {
				appendChatEntry("assistant", "I ran into a problem handling that request. Please try again.");
				console.error(error);
			} finally {
				setFormDisabled(false);
				chatInput.focus();
			}
		});

		async function loadPortfolio() {
			try {
				const response = await fetch("/api/portfolio");
				if (!response.ok) {
					throw new Error("Failed to load portfolio");
				}
				const data = await response.json();
				updatePortfolio(data);
				if (!state.messages.length) {
					appendChatEntry("assistant", "Hi! Ask me to add blockchain addresses or manual holdings (gold or USD), adjust amounts, or remove entries.");
					state.messages.push({ role: "assistant", content: "How can I help with your portfolio today?" });
				}
			} catch (error) {
				console.error(error);
			}
		}

		function updatePortfolio(summary) {
			totalUsdEl.textContent = state.currencyFormatter.format(summary.totals.usd);
			blockchainEl.textContent = state.currencyFormatter.format(summary.totals.byCategory.blockchain || 0);
			physicalEl.textContent = state.currencyFormatter.format(summary.totals.byCategory.physical || 0);
			lastUpdatedEl.textContent = new Date(summary.updatedAt).toLocaleString();

			renderAssetRows(summary.assets);
			renderChart(summary.assets);
		}

		function renderAssetRows(assets) {
			assetRowsEl.innerHTML = "";
			for (const asset of assets) {
				const row = document.createElement("tr");
				row.innerHTML = [
					\`<td>\${asset.label}</td>\`,
					\`<td>\${describeAssetType(asset)}</td>\`,
					\`<td>\${formatQuantity(asset)}</td>\`,
					\`<td>\${formatPrice(asset.usdPrice)}</td>\`,
					\`<td>\${state.currencyFormatter.format(asset.usdValue)}</td>\`,
					\`<td class="status-\${asset.status}">\${asset.status === "ok" ? "OK" : asset.message ?? "Check"}</td>\`,
				].join("");
				assetRowsEl.appendChild(row);
			}
		}

		function renderChart(assets) {
			const ctx = chartCanvas.getContext("2d");
			ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

			const total = assets.reduce((sum, asset) => sum + Math.max(asset.usdValue, 0), 0);
			if (!total) {
				ctx.fillStyle = "rgba(82, 95, 127, 0.3)";
				ctx.beginPath();
				ctx.arc(chartCanvas.width / 2, chartCanvas.height / 2, chartCanvas.width / 3, 0, Math.PI * 2);
				ctx.fill();
				chartLegend.innerHTML = "<p>No holdings yet.</p>";
				return;
			}

			let startAngle = -Math.PI / 2;
			const radius = chartCanvas.width / 2.4;
			const centerX = chartCanvas.width / 2;
			const centerY = chartCanvas.height / 2;

			chartLegend.innerHTML = "";

			assets.forEach((asset, index) => {
				const value = Math.max(asset.usdValue, 0);
				const sliceAngle = (value / total) * Math.PI * 2;
				const endAngle = startAngle + sliceAngle;
				const color = state.chartColors[index % state.chartColors.length];

				ctx.beginPath();
				ctx.moveTo(centerX, centerY);
				ctx.arc(centerX, centerY, radius, startAngle, endAngle);
				ctx.closePath();
				ctx.fillStyle = color;
				ctx.fill();

				startAngle = endAngle;

				const legendItem = document.createElement("div");
				legendItem.className = "legend-item";
				legendItem.innerHTML = \`
					<span class="legend-swatch" style="background:\${color}"></span>
					<span>\${asset.label}</span>
					<strong>\${((value / total) * 100).toFixed(1)}%</strong>
				\`;
				chartLegend.appendChild(legendItem);
			});
		}

		function describeAssetType(asset) {
			if (asset.category === "blockchain") {
				return \`\${asset.chain?.toUpperCase()} address\\n\${asset.address}\`;
			}
			return \`\${asset.symbol} holding\`;
		}

		function formatQuantity(asset) {
			const quantity = state.numberFormatter.format(asset.quantity);
			if (asset.category === "blockchain") {
				return \`\${quantity} \${asset.chain?.toUpperCase()}\`;
			}
			return \`\${quantity} \${asset.symbol === "GOLD" ? "troy oz" : "USD"}\`;
		}

		function formatPrice(price) {
			if (!Number.isFinite(price) || price <= 0) {
				return "--";
			}
			return state.currencyFormatter.format(price);
		}

		function appendChatEntry(role, text) {
			const entry = document.createElement("div");
			entry.className = "chat-entry";
			entry.dataset.role = role;

			const bubble = document.createElement("div");
			bubble.className = "chat-bubble";
			bubble.textContent = text;

			const meta = document.createElement("span");
			meta.className = "chat-meta";
			meta.textContent = role === "user" ? "You" : "Assistant";

			entry.appendChild(meta);
			entry.appendChild(bubble);
			chatLog.appendChild(entry);
			chatLog.scrollTop = chatLog.scrollHeight;
		}

		function buildAssistantReply(reply, operations) {
			if (!operations || !operations.length) {
				return reply;
			}
			const lines = [reply.trim(), "", "Operations:"];
			for (const operation of operations) {
				lines.push(\`- [\${operation.status}] \${operation.detail}\`);
			}
			return lines.join("\\n");
		}

		function setFormDisabled(disabled) {
			chatInput.disabled = disabled;
			chatForm.querySelector("button").disabled = disabled;
		}
	</script>
</body>
</html>`;
}

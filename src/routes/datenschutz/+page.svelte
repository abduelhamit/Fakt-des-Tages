<script lang="ts">
	import { PROVIDER } from '#lib/provider.ts';
</script>

<svelte:head><title>Datenschutz — Fakt des Tages</title></svelte:head>

<!-- Every claim below was checked against the build rather than copied from a generator: no
     storage API appears anywhere in the source, nothing is fetched from anywhere but this site, and
     every img/script/link in the built HTML is same-origin. If that ever stops being true — an embedded video, an
     external web font, a counter — this page becomes wrong before anything else on the site does. -->
<main class="mx-auto max-w-2xl p-6">
	<!-- The one hyphenated word on the site: at 2rem it is 349 px wide, and a phone narrower than
	     350 px would otherwise scroll sideways. See src/routes/CLAUDE.md. -->
	<h1 class="text-[2rem]/normal font-semibold hyphens-auto">Datenschutzerklärung</h1>

	<div class="markdown-body mt-6">
		<h2>Verantwortlicher</h2>
		<p>Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der DSGVO ist:</p>
		<p>
			{PROVIDER.name}<br />
			{#each PROVIDER.address as line, i (i)}{line}<br />{/each}
			E-Mail: <a href="mailto:{PROVIDER.email}">{PROVIDER.email}</a>
		</p>

		<h2>Was in Ihrem Browser geschieht</h2>
		<p>
			Diese Website ist eine rein statische Seite. Sie setzt <strong>keine Cookies</strong>, sie
			speichert nichts im Local oder Session Storage, sie bindet
			<strong>keine externen Schriftarten, Karten, Videos oder Skripte</strong> ein und sie
			verwendet <strong>keine Analyse- oder Tracking-Dienste</strong>. Es gibt kein Kontaktformular,
			keinen Newsletter und keine Benutzerkonten.
		</p>
		<p>
			Auch die Suche und der Kalender laufen vollständig in Ihrem Browser. Sobald eine Seite geladen
			ist, holt Ihr Browser außerdem <strong>das Programm für die Suche</strong>, damit sie
			zuverlässig bereitsteht. Wenn Sie zu einem anderen Tag wechseln oder das Suchfeld verwenden,
			lädt er <strong>die dafür nötigen Daten</strong> nach. Kehren Sie aus einem anderen Tab oder
			Programm zu dieser Seite zurück oder lässt sich ein Tag nicht laden, fragt er kurz nach, ob es
			inzwischen <strong>eine neue Version der Website</strong>
			gibt. All das ruft er <strong>ausschließlich von dieser Website</strong> ab, nie von Dritten. Was
			Sie in das Suchfeld tippen, verlässt Ihr Gerät nicht.
		</p>

		<h2>Hosting und Server-Logfiles</h2>
		<p>
			Die Seite wird von <strong>GitHub Pages</strong> ausgeliefert, einem Dienst der GitHub, Inc.,
			88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Beim Abruf einer Seite übermittelt
			Ihr Browser technisch notwendige Daten an GitHub, die dort in Server-Logfiles verarbeitet
			werden — insbesondere Ihre <strong>IP-Adresse</strong>, Datum und Uhrzeit des Abrufs, die
			angeforderte Datei sowie die übermittelte Browser- und Betriebssystemkennung.
		</p>
		<p>
			Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in der
			technisch fehlerfreien Auslieferung und der Sicherheit der Website; ohne die Übermittlung der
			IP-Adresse lässt sich eine Seite nicht ausliefern. Auf Umfang und Speicherdauer dieser
			Logfiles habe ich keinen Einfluss. Die Verarbeitung findet auch in den USA statt; Einzelheiten
			und die dortigen Garantien beschreibt GitHub in seiner
			<a
				href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"
			>
				Datenschutzerklärung</a
			>.
		</p>

		<h2>Links zu anderen Websites</h2>
		<p>
			Viele Fakten verlinken auf externe Seiten, etwa auf Wikipedia. Diese Links werden erst
			aufgerufen, wenn Sie sie anklicken — dann gelten die Datenschutzbestimmungen der jeweiligen
			Seite, auf deren Inhalt und Datenverarbeitung ich keinen Einfluss habe.
		</p>

		<h2>Ihre Rechte</h2>
		<p>
			Sie haben das Recht auf Auskunft über die zu Ihrer Person verarbeiteten Daten (Art. 15 DSGVO),
			auf Berichtigung (Art. 16), auf Löschung (Art. 17), auf Einschränkung der Verarbeitung (Art.
			18), auf Datenübertragbarkeit (Art. 20) sowie auf Widerspruch gegen eine Verarbeitung auf
			Grundlage berechtigter Interessen (Art. 21). Wenden Sie sich dafür an die oben genannte
			Adresse.
		</p>
		<p>
			Unabhängig davon steht Ihnen ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu
			(Art. 77 DSGVO), insbesondere in dem Mitgliedstaat Ihres Aufenthaltsorts oder des mutmaßlichen
			Verstoßes.
		</p>

		<h2>Keine Weitergabe, keine automatisierten Entscheidungen</h2>
		<p>
			Über das oben beschriebene Hosting hinaus werden keine personenbezogenen Daten an Dritte
			weitergegeben. Eine automatisierte Entscheidungsfindung einschließlich Profiling nach Art. 22
			DSGVO findet nicht statt.
		</p>
	</div>
</main>

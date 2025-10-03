document.getElementById("planForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const locText = document.getElementById("loc").value;
  const latlng = locText.split(",").map(s => parseFloat(s.trim()));
  const interests = document.getElementById("interests").value.split(",").map(s => s.trim());
  const body = { location: { lat: latlng[0], lng: latlng[1] }, interests: interests, budget: "low" };

  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const results = document.getElementById("results");
    if (data.error) { results.innerText = "Error: " + data.error; return; }
    results.innerHTML = "";
    data.itinerary.forEach(stop => {
      const el = document.createElement("div");
      el.className = "card my-2 p-2";
      el.innerHTML = `<strong>${stop.order}. ${stop.name}</strong><div>${stop.time} • ${stop.cost}</div><p>${stop.reason}</p>`;
      results.appendChild(el);
    });
  } catch (err) {
    document.getElementById("results").innerText = "Network error: " + err.toString();
  }
});

/* Final updated app.js
   - Expects firebaseConfig.js to be loaded BEFORE this file
   - Works with the HTML files you already have (manager.html, worker.html, past.html, index.html)
*/

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ app.js loaded");

  // Defensive check: auth & db must exist
  if (typeof firebase === "undefined" || typeof firebase.database === "undefined" || typeof firebase.auth === "undefined") {
    console.error("Firebase not loaded. Ensure firebaseConfig.js + firebase SDK scripts are included before app.js");
    return;
  }
  const auth = firebase.auth();
  const db = firebase.database();

  const path = location.pathname.split("/").pop().toLowerCase();
  const today = new Date().toLocaleDateString();

  /* INDEX (login/signup) — only form handlers here, don't auto-redirect */
  if (path === "" || path === "index.html") {
    const loginForm = document.getElementById("loginForm");
    const signUpForm = document.getElementById("signUpForm");
    const forgotPassword = document.getElementById("forgotPassword");
    const rememberMe = document.getElementById("rememberMe");

    // LOGIN
    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const persistence = (rememberMe && rememberMe.checked)
          ? firebase.auth.Auth.Persistence.LOCAL
          : firebase.auth.Auth.Persistence.SESSION;
        await auth.setPersistence(persistence);
        const userCred = await auth.signInWithEmailAndPassword(email, password);
        const snap = await db.ref("users/" + userCred.user.uid).once("value");
        const profile = snap.val();
        if (!profile || !profile.role) {
          alert("Your account has no role set. Please sign up again or contact admin.");
          await auth.signOut();
          return;
        }
        if (profile.role === "manager") location.href = "manager.html";
        else location.href = "worker.html";
      } catch (err) {
        console.error("Login failed:", err);
        alert("Login failed: " + (err.message || err));
      }
    });

    // SIGNUP
    signUpForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const email = document.getElementById("signUpEmail").value.trim();
        const password = document.getElementById("signUpPassword").value;
        const role = document.getElementById("role").value;
        const machineName = document.getElementById("machineName")?.value?.trim() || "";
        if (!role) return alert("Please select role.");
        if (role === "worker" && !machineName) return alert("Machine name required for workers.");
        const uc = await auth.createUserWithEmailAndPassword(email, password);
        await db.ref("users/" + uc.user.uid).set({
          email, role, machineName: role === "worker" ? machineName : "", createdAt: Date.now()
        });
        alert("Account created. Sign in with your credentials.");
        await auth.signOut();
        location.href = "index.html";
      } catch (err) {
        console.error("Signup failed:", err);
        alert("Signup failed: " + (err.message || err));
      }
    });

    forgotPassword?.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = prompt("Enter email to receive reset link:");
      if (!email) return;
      try {
        await auth.sendPasswordResetEmail(email);
        alert("Reset sent to " + email);
      } catch (err) {
        console.error("Reset failed:", err);
        alert("Error sending reset: " + (err.message || err));
      }
    });

    return; // don't run dashboard code on index
  }

  /* For manager/worker/past pages: require authentication and profile */
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // Not logged in
      console.log("User not signed in, redirecting to login.");
      return (location.href = "index.html");
    }

    const snap = await db.ref("users/" + user.uid).once("value");
    const profile = snap.val();
    if (!profile || !profile.role) {
      console.warn("User profile missing role. Signing out.");
      await auth.signOut();
      return (location.href = "index.html");
    }

    // attach global logout (robust)
    attachGlobalLogout();

    /* -------------------- MANAGER -------------------- */
    if (path === "manager.html" && profile.role === "manager") {
      console.log("Manager page active");
      document.getElementById("currentDate").innerText = today;

      const jobForm = document.getElementById("jobForm");
      const tbody = document.getElementById("jobTableBody");
      const searchInput = document.getElementById("searchInput");

      // Add job (managerId stored)
      jobForm?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const job = {
          jobNo: document.getElementById("jobNo").value.trim(),
          jobName: document.getElementById("jobName").value.trim(),
          formName: document.getElementById("formName").value.trim(),
          quantity: document.getElementById("quantity").value.trim(),
          workerName: document.getElementById("workerName").value.trim(),
          machineName: document.getElementById("machineName").value.trim(),
          good: 0, waste: 0, remark: "", completed: false,
          date: today, managerId: user.uid,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        try {
          await db.ref("jobs").push(job);
          jobForm.reset();
        } catch (err) {
          console.error("Add job failed:", err);
          alert("Failed to add job: " + (err.message || err));
        }
      });

      // Listen and render manager's active jobs (match header columns exactly)
      db.ref("jobs").on("value", (snapshot) => {
        tbody.innerHTML = "";
        let idx = 1;
        snapshot.forEach(child => {
          const j = child.val();
          if (!j) return;
          // show only today's uncompleted jobs for this manager
          if (j.managerId !== user.uid || j.date !== today || j.completed) return;

          const tr = document.createElement("tr");
          // Build cells to match header: S.No, Job No, Job Name, Form, Worker, Machine, Qty, Good, Waste, Completed, Action
          tr.innerHTML = `
            <td>${idx++}</td>
            <td>${escapeHtml(j.jobNo)}</td>
            <td>${escapeHtml(j.jobName)}</td>
            <td>${escapeHtml(j.formName)}</td>
            <td>${escapeHtml(j.workerName)}</td>
            <td>${escapeHtml(j.machineName)}</td>
            <td>${escapeHtml(j.quantity)}</td>
            <td>${escapeHtml(j.good)}</td>
            <td>${escapeHtml(j.waste)}</td>
            <td><input type="checkbox" class="mgr-completed" ${j.completed ? "checked" : ""}></td>
            <td><button class="del-action pill error">Delete</button></td>
          `;

          // completed checkbox
          tr.querySelector(".mgr-completed")?.addEventListener("change", async (e) => {
            try {
              await db.ref("jobs/" + child.key).update({ completed: !!e.target.checked, date: today });
            } catch (err) {
              console.error("Toggle completed failed:", err);
            }
          });

          // action delete (placed in last column)
          tr.querySelector(".del-action")?.addEventListener("click", async () => {
            if (!confirm("Delete this job?")) return;
            try {
              await db.ref("jobs/" + child.key).remove();
            } catch (err) {
              console.error("Delete failed:", err);
              alert("Delete failed: " + (err.message || err));
            }
          });

          tbody.appendChild(tr);
        });

        // search filter (set once)
        if (searchInput && !searchInput._attached) {
          searchInput._attached = true;
          searchInput.addEventListener("input", () => {
            const term = searchInput.value.toLowerCase();
            Array.from(tbody.rows).forEach(row => {
              row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
          });
        }
      });
    }

    /* -------------------- WORKER -------------------- */
    if (path === "worker.html" && profile.role === "worker") {
      console.log("Worker page active");
      document.getElementById("currentDate").innerText = today;
      document.getElementById("workerMachineName").innerText = profile.machineName || "N/A";

      const tbody = document.getElementById("jobTableBody");
      const searchInput = document.getElementById("searchInput");

      db.ref("jobs").on("value", (snapshot) => {
        tbody.innerHTML = "";
        let idx = 1;
        snapshot.forEach(child => {
          const j = child.val();
          if (!j) return;
          // show only jobs for this worker's machine and not completed
          if (j.machineName !== profile.machineName || j.completed) return;

          const tr = document.createElement("tr");
          tr.setAttribute("data-key", child.key);
          tr.innerHTML = `
            <td>${idx++}</td>
            <td>${escapeHtml(j.jobNo)}</td>
            <td>${escapeHtml(j.jobName)}</td>
            <td>${escapeHtml(j.formName)}</td>
            <td>${escapeHtml(j.workerName)}</td>
            <td>${escapeHtml(j.quantity)}</td>
            <td contenteditable="true" class="editable">${escapeHtml(j.good)}</td>
            <td contenteditable="true" class="editable">${escapeHtml(j.waste)}</td>
            <td contenteditable="true" class="editable">${escapeHtml(j.remark || "")}</td>
            <td><button class="save-btn primary-btn">Save</button></td>
          `;

          tr.querySelector(".save-btn")?.addEventListener("click", async () => {
            const cells = tr.querySelectorAll("td");
            const updates = {
              good: cells[6].innerText.trim(),
              waste: cells[7].innerText.trim(),
              remark: cells[8].innerText.trim(),
              completed: true,
              date: today,
              updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            try {
              await db.ref("jobs/" + child.key).update(updates);
              alert("Saved and moved to past records.");
            } catch (err) {
              console.error("Worker save failed:", err);
              alert("Save failed: " + (err.message || err));
            }
          });

          tbody.appendChild(tr);
        });

        if (searchInput && !searchInput._attached) {
          searchInput._attached = true;
          searchInput.addEventListener("input", () => {
            const term = searchInput.value.toLowerCase();
            Array.from(tbody.rows).forEach(row => {
              row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
          });
        }
      });
    }

    /* -------------------- PAST RECORDS -------------------- */
    if (path === "past.html" && profile.role === "manager") {
      console.log("Past page active");
      const container = document.getElementById("pastRecords");
      const searchInput = document.getElementById("pastSearch");

      db.ref("jobs").on("value", (snapshot) => {
        container.innerHTML = "";
        const grouped = {};
        snapshot.forEach(child => {
          const j = child.val();
          if (!j) return;
          if (j.managerId !== user.uid) return; // only this manager's records
          const d = j.date || "Unknown";
          (grouped[d] ||= []).push({ ...j, key: child.key });
        });

        const dates = Object.keys(grouped).sort((a,b)=> new Date(b) - new Date(a));
        if (dates.length === 0) {
          container.innerHTML = `<p style="text-align:center;color:#666;">No records yet.</p>`;
          return;
        }

        dates.forEach(d => {
          const section = document.createElement("div");
          section.className = "date-section";
          section.innerHTML = `
            <div class="date-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <h3 style="margin:0">${escapeHtml(d)}</h3>
              <div>
                <button class="exportDateBtn primary-btn" data-date="${escapeHtml(d)}">⬇ Export PDF</button>
              </div>
            </div>
          `;

          let html = `<table data-date="${escapeHtml(d)}">
            <thead>
              <tr>
                <th>S.No</th><th>Job No</th><th>Job Name</th><th>Form</th>
                <th>Worker</th><th>Machine</th><th>Qty</th><th>Good</th>
                <th>Waste</th><th>Remark</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>`;

          let i = 1;
          grouped[d].forEach(j => {
            html += `<tr data-key="${j.key}">
              <td>${i++}</td>
              <td>${escapeHtml(j.jobNo)}</td>
              <td>${escapeHtml(j.jobName)}</td>
              <td>${escapeHtml(j.formName)}</td>
              <td>${escapeHtml(j.workerName)}</td>
              <td>${escapeHtml(j.machineName||"")}</td>
              <td>${escapeHtml(j.quantity)}</td>
              <td>${escapeHtml(j.good)}</td>
              <td>${escapeHtml(j.waste)}</td>
              <td>${escapeHtml(j.remark||"")}</td>
              <td>${j.completed ? "Completed" : "Pending"}</td>
              <td><button class="del-btn pill error">Delete</button></td>
            </tr>`;
          });

          html += `</tbody></table>`;
          section.innerHTML += html;
          container.appendChild(section);
        });

        // search
        if (searchInput && !searchInput._attached) {
          searchInput._attached = true;
          searchInput.addEventListener("input", () => {
            const term = searchInput.value.toLowerCase();
            container.querySelectorAll("tbody tr").forEach(row => {
              row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
            });
          });
        }

        // export per date (skip last column Action)
        container.querySelectorAll(".exportDateBtn").forEach(btn => {
          btn.addEventListener("click", () => {
            const date = btn.dataset.date;
            const table = container.querySelector(`table[data-date="${date}"]`);
            if (!table) return;
            const headers = Array.from(table.querySelectorAll("thead th")).map(h => h.innerText).slice(0,-1);
            const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr =>
              Array.from(tr.querySelectorAll("td")).map(td => td.innerText).slice(0,-1)
            );
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF("l", "pt", "a4");
            doc.text(`Past Records - ${date}`, 40, 40);
            doc.autoTable({ head: [headers], body: rows, startY: 60, styles: { fontSize: 10 }});
            doc.save(`past-records-${date}.pdf`);
          });
        });

        // delete handlers
        container.querySelectorAll(".del-btn").forEach(btn => {
          btn.addEventListener("click", async () => {
            const tr = btn.closest("tr");
            const key = tr?.dataset?.key;
            if (!key) return alert("Missing record id.");
            if (!confirm("Delete this record?")) return;
            try {
              await db.ref("jobs/" + key).remove();
              tr.remove();
            } catch (err) {
              console.error("Delete past record failed:", err);
              alert("Delete failed: " + (err.message || err));
            }
          });
        });
      });
    }
  });

  // helper: attach global logout for pages that rendered before onAuthStateChanged finished
  function attachGlobalLogout() {
    const logout = document.getElementById("logoutBtn");
    if (!logout || logout._attached) return;
    logout._attached = true;
    logout.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await firebase.auth().signOut();
        location.href = "index.html";
      } catch (err) {
        console.error("Logout failed:", err);
        alert("Logout failed: " + (err.message || err));
      }
    });
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
});

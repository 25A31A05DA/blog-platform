const state = {
  token: localStorage.getItem("blog_token") || "",
  user: JSON.parse(localStorage.getItem("blog_user") || "null"),
  posts: [],
  mode: "login",
  editingPostId: null
};

const elements = {
  postFeed: document.querySelector("#postFeed"),
  postCount: document.querySelector("#postCount"),
  commentCount: document.querySelector("#commentCount"),
  postForm: document.querySelector("#postForm"),
  postTitle: document.querySelector("#postTitle"),
  postExcerpt: document.querySelector("#postExcerpt"),
  postContent: document.querySelector("#postContent"),
  editorTitle: document.querySelector("#editorTitle"),
  editorHelper: document.querySelector("#editorHelper"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  openAuthButton: document.querySelector("#openAuthButton"),
  logoutButton: document.querySelector("#logoutButton"),
  authDialog: document.querySelector("#authDialog"),
  closeAuthButton: document.querySelector("#closeAuthButton"),
  authTitle: document.querySelector("#authTitle"),
  authForm: document.querySelector("#authForm"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authSubmit: document.querySelector("#authSubmit"),
  nameField: document.querySelector("#nameField"),
  loginTab: document.querySelector("#loginTab"),
  registerTab: document.querySelector("#registerTab"),
  toast: document.querySelector("#toast")
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload;
}

function persistAuth(token, user) {
  state.token = token || "";
  state.user = user || null;
  if (token && user) {
    localStorage.setItem("blog_token", token);
    localStorage.setItem("blog_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("blog_token");
    localStorage.removeItem("blog_user");
  }
  renderAuth();
}

function renderAuth() {
  const loggedIn = Boolean(state.user);
  elements.openAuthButton.classList.toggle("hidden", loggedIn);
  elements.logoutButton.classList.toggle("hidden", !loggedIn);
  elements.editorHelper.textContent = loggedIn
    ? `Posting as ${state.user.name}. You can edit or delete only your own posts.`
    : "Login or register to publish new posts.";
}

function renderPosts() {
  elements.postCount.textContent = state.posts.length;
  elements.commentCount.textContent = state.posts.reduce((total, post) => total + post.comments.length, 0);

  if (!state.posts.length) {
    elements.postFeed.innerHTML = '<div class="empty-state">No posts yet. Register and publish the first article.</div>';
    return;
  }

  elements.postFeed.innerHTML = state.posts
    .map(post => {
      const canEdit = state.user && state.user.id === post.authorId;
      const comments = post.comments.length
        ? post.comments
            .map(
              comment => `
                <article class="comment">
                  <div class="comment-meta">${escapeHtml(comment.authorName)} • ${formatDate(comment.createdAt)}</div>
                  <div class="comment-text">${escapeHtml(comment.content)}</div>
                </article>
              `
            )
            .join("")
        : '<p class="helper">No comments yet. Start the conversation.</p>';

      return `
        <article class="post-card" data-post-id="${post.id}">
          <div class="post-meta">${escapeHtml(post.authorName)} • Updated ${formatDate(post.updatedAt)}</div>
          <h3 class="post-title">${escapeHtml(post.title)}</h3>
          <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
          <div class="post-content">${escapeHtml(post.content)}</div>
          ${
            canEdit
              ? `<div class="actions">
                  <button class="secondary-button" data-action="edit" type="button">Edit post</button>
                  <button class="danger-button" data-action="delete" type="button">Delete</button>
                </div>`
              : ""
          }
          <section class="comments">
            <strong>${post.comments.length} comment${post.comments.length === 1 ? "" : "s"}</strong>
            <div class="comment-list">${comments}</div>
            <form class="comment-form" data-action="comment">
              <input name="content" type="text" placeholder="${state.user ? "Add a thoughtful comment" : "Login to comment"}" ${state.user ? "" : "disabled"} />
              <button class="secondary-button" type="submit" ${state.user ? "" : "disabled"}>Comment</button>
            </form>
          </section>
        </article>
      `;
    })
    .join("");
}

async function loadPosts() {
  const payload = await api("/api/posts");
  state.posts = payload.posts;
  renderPosts();
}

function setAuthMode(mode) {
  state.mode = mode;
  const isRegister = mode === "register";
  elements.authTitle.textContent = isRegister ? "Register" : "Login";
  elements.authSubmit.textContent = isRegister ? "Create account" : "Login";
  elements.nameField.classList.toggle("hidden", !isRegister);
  elements.authName.required = isRegister;
  elements.loginTab.classList.toggle("active", !isRegister);
  elements.registerTab.classList.toggle("active", isRegister);
}

function resetEditor() {
  state.editingPostId = null;
  elements.postForm.reset();
  elements.editorTitle.textContent = "Create post";
  elements.postForm.querySelector("button[type='submit']").textContent = "Publish post";
  elements.cancelEditButton.classList.add("hidden");
}

elements.openAuthButton.addEventListener("click", () => elements.authDialog.showModal());
elements.closeAuthButton.addEventListener("click", () => elements.authDialog.close());
elements.loginTab.addEventListener("click", () => setAuthMode("login"));
elements.registerTab.addEventListener("click", () => setAuthMode("register"));
elements.cancelEditButton.addEventListener("click", resetEditor);

elements.logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // Local state should still clear if the server session is already gone.
  }
  persistAuth("", null);
  resetEditor();
  renderPosts();
  showToast("Logged out.");
});

elements.authForm.addEventListener("submit", async event => {
  event.preventDefault();
  const body = {
    name: elements.authName.value,
    email: elements.authEmail.value,
    password: elements.authPassword.value
  };
  try {
    const payload = await api(`/api/${state.mode}`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    persistAuth(payload.token, payload.user);
    elements.authForm.reset();
    elements.authDialog.close();
    renderPosts();
    showToast(state.mode === "register" ? "Account created." : "Logged in.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.postForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.user) {
    elements.authDialog.showModal();
    return;
  }
  const body = {
    title: elements.postTitle.value,
    excerpt: elements.postExcerpt.value,
    content: elements.postContent.value
  };
  const editing = Boolean(state.editingPostId);
  const url = editing ? `/api/posts/${state.editingPostId}` : "/api/posts";
  try {
    await api(url, {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    resetEditor();
    await loadPosts();
    showToast(editing ? "Post updated." : "Post published.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.postFeed.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  const card = event.target.closest(".post-card");
  const post = state.posts.find(item => item.id === card?.dataset.postId);
  if (!post) return;

  if (button.dataset.action === "edit") {
    state.editingPostId = post.id;
    elements.postTitle.value = post.title;
    elements.postExcerpt.value = post.excerpt;
    elements.postContent.value = post.content;
    elements.editorTitle.textContent = "Edit post";
    elements.postForm.querySelector("button[type='submit']").textContent = "Save changes";
    elements.cancelEditButton.classList.remove("hidden");
    document.querySelector("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (button.dataset.action === "delete") {
    const confirmed = window.confirm("Delete this post permanently?");
    if (!confirmed) return;
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE" });
      await loadPosts();
      resetEditor();
      showToast("Post deleted.");
    } catch (error) {
      showToast(error.message);
    }
  }
});

elements.postFeed.addEventListener("submit", async event => {
  if (!event.target.matches(".comment-form")) return;
  event.preventDefault();
  if (!state.user) {
    elements.authDialog.showModal();
    return;
  }
  const card = event.target.closest(".post-card");
  const input = event.target.elements.content;
  try {
    await api(`/api/posts/${card.dataset.postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: input.value })
    });
    input.value = "";
    await loadPosts();
    showToast("Comment added.");
  } catch (error) {
    showToast(error.message);
  }
});

async function boot() {
  renderAuth();
  setAuthMode("login");
  try {
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

boot();

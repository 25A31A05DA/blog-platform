# Opal Journal Blog Platform

A clean full-stack blogging platform with:

- User registration, login, logout, and token authentication
- Create, edit, and delete blog posts
- Comment section for user interaction
- RESTful backend APIs
- File-backed JSON database integration in `data/db.json`
- Premium responsive UI

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## API Routes

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/posts`
- `POST /api/posts`
- `PUT /api/posts/:id`
- `DELETE /api/posts/:id`
- `POST /api/posts/:id/comments`

## Push To GitHub

1. Create a new empty repository on GitHub.
2. Run these commands from this project folder:

```bash
git init
git add .
git commit -m "Build blog platform with comments"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPOSITORY` with your GitHub username and repo name.

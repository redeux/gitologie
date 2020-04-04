require('dotenv').config()
const {
  Octokit
} = require("@octokit/rest");
const {
  throttling
} = require("@octokit/plugin-throttling");
const MyOctokit = Octokit.plugin(throttling);

const owner = process.env.REPO_OWNER;
const repo = process.env.REPO_NAME;
let userList = new Set();

const gitHub = new MyOctokit({
  auth: process.env.GITHUB_API_KEY,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      gitHub.log.warn(
        `Request quota exhausted for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 0) {
        // only retries once
        console.log(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onAbuseLimit: (retryAfter, options) => {
      // does not retry, only logs a warning
      gitHub.log.warn(
        `Abuse detected for request ${options.method} ${options.url}`
      );
    }
  }
})

async function getComments() {
  console.log('GETTING COMMENT LIST ...');
  const commentsList = await gitHub.issues.listCommentsForRepo({
    owner,
    repo,
  });
  return await gitHub.paginate(commentsList);
}

async function getIssues() {
  console.log('GETTING ISSUE LIST ...');

  const issuesList = await gitHub.issues.listForRepo({
    owner,
    repo,
    state: 'all'
  });
  return await gitHub.paginate(issuesList);
}

async function getCommenters(allComments) {
  console.log('GETTING COMMENTERS ...');

  const commentUsers = allComments.map(comment => comment.user.login);
  commentUsers.map(userId => userList.add(userId));
  console.log('COMMERTERS COMPLETE! \n');
}

async function getIssueOpeners(allIssues) {
  console.log('GETTING ISSUE OPENERS ...');

  const issueUsers = allIssues.map(issue => issue.user.login);
  issueUsers.map(userId => userList.add(userId));
  console.log('ISSUE OPENERS COMPLETE!\n');
}

async function getIssueReactions(allIssues) {
  console.log('GETTING ISSUE REACTIONS ...');

  const issues = allIssues.map(issue => issue.number);
  const issueLen = issues.length;
  let page;
  for (let i = 0; i < issueLen; i++) {
    console.log(`ISSUE REACTION FOR ISSUE ID: ${issues[i]} ...`);
    page = 1;
    while (page != 0) {
      const reactionList = await gitHub.reactions.listForIssue({
        owner,
        repo,
        issue_number: issues[i],
        per_page: 100,
        page,
        headers: {
          accept: 'application/vnd.github.squirrel-girl-preview+json'
        }
      });
      reactionList.data.length < 100 ? page = 0 : page++;
      reactionList.data.map(reaction => userList.add(reaction.user.login));
    }
  }
  console.log('ISSUE REACTIONS COMPLETE!\n');
}

async function getCommentReactions(allComments) {
  console.log('GETTING COMMENT REACTIONS ...');
  const comments = allComments.map(comment => comment.id);

  const commentLen = comments.length;
  let page;
  for (let i = 0; i < commentLen; i++) {
    console.log(`GETTING COMMENT REACTION FOR COMMENT ID: ${comments[i]} ...`);
    page = 1;
    while (page != 0) {
      const reactionList = await gitHub.reactions.listForIssueComment({
        owner,
        repo,
        comment_id: comments[i],
        per_page: 100,
        page,
        headers: {
          accept: 'application/vnd.github.squirrel-girl-preview+json'
        }
      });
      reactionList.data.length < 100 ? page = 0 : page++;
      reactionList.data.map(reaction => userList.add(reaction.user.login));
    }
  }
  console.log('COMMENT REACTIONS COMPLETE!\n');
}

async function getAllUsers() {
  const allIssues = await getIssues();
  console.log('ISSUE LIST COMPLETE!\n');

  const allComments = await getComments();
  console.log('COMMENT LIST COMPLETE!\n');
  
  await getIssueOpeners(allIssues);
  await getCommenters(allComments);
  await getIssueReactions(allIssues);
  await getCommentReactions(allComments);

  console.log('USER LIST:');
  console.log(userList);
}

getAllUsers();

// go to each user profile and capture
// name [required]
// email [required]
// orgs [optional]
// website [optional]
// followers [optional]
// following [optional]
// stars [optional

// output the profile data somewhere
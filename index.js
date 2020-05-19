require('dotenv').config()
const fs = require('fs');
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

async function getIssueReaction(issue_number, page) {
  return await gitHub.reactions.listForIssue({
    owner,
    repo,
    issue_number,
    per_page: 100,
    page,
    headers: {
      accept: 'application/vnd.github.squirrel-girl-preview+json'
    }
  });
}

async function getAllIssueReactions(allIssues) {
  console.log('GETTING ISSUE REACTIONS ...');

  const issues = allIssues.map(issue => issue.number);
  const issueLen = issues.length;
  let page, retryCount;

  for (let i = 0; i < issueLen; i++) {
    console.log(`ISSUE REACTION FOR ISSUE ID: ${issues[i]} ...`);
    page = 1;
    retryCount = 0;
    while (page != 0 && retryCount < 3) {
      await getIssueReaction(issues[i], page)
        .then(reactionList => {
          retryCount = 0;
          reactionList.data.length < 100 ? page = 0 : page++;
          reactionList.data.map(reaction => userList.add(reaction.user.login));
        })
        .catch(err => {
          console.log(`ERROR ON ISSUE ID: ${issues[i]}`);
          console.log(`ERROR ${err}`);
          console.log(`RETRY ${retryCount} FOR ISSUE ID:  ${issues[i]}`);
          retryCount++;
          retryCount = 3 ? console.log(`HIT MAX RETRIES FOR ISSUE ID: ${issues[i]}`) : null;
        });
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
  getRateLimit();
  const allIssues = await getIssues();
  console.log('ISSUE LIST COMPLETE!\n');
  getRateLimit();

  const allComments = await getComments();
  console.log('COMMENT LIST COMPLETE!\n');
  getRateLimit();

  await getIssueOpeners(allIssues);
  getRateLimit();

  await getCommenters(allComments);
  getRateLimit();

  await getAllIssueReactions(allIssues);
  getRateLimit();

  await getCommentReactions(allComments);
  getRateLimit();

  console.log('USER LIST:');
  console.log(userList);

  const userListArray = Array.from(userList);
  writeArrayToFile(userListArray);
  return userListArray;
}

async function getUserDetails(username) {
  return await gitHub.users.getByUsername({
    username,
  });
}

async function getAllUserDetails(userListArray) {
  console.log('GETTING ALL USER DETAILS ...')
  return await Promise.all(userListArray.map(async (username) => {
    console.log(`GETTING DETAILS FOR USER: ${username} ...`);
    // res = await getUserDetails(username);
    res = getUserDetails(username);
    return [res.data.login, res.data.name, res.data.email, res.data.company, res.data.location, res.data.blog, res.data.bio, res.data.followers, res.data.following];
  }))
}

async function writeArrayToCSV(userInfo) {
  console.log('STARTING CSV OUTPUT ...')

  let csvHeader = ['username', 'name', 'email', 'company', 'location', 'blog', 'bio', 'followers', 'following'];
  userInfo.unshift(csvHeader);

  const writeStream = fs.createWriteStream(`data-${repo}-${Date.now()}.csv`);
  writeStream.on('error', function (err) {
    if (err) throw err
  });
  userInfo.forEach(function (row) {
    writeStream.write(row.join('\t') + '\n');
  });
  writeStream.end();

  console.log('CSV SAVED!\n');
}

async function writeArrayToFile(userListArray) {
  console.log('STARTING USER LIST OUTPUT ...')

  const filename = `user_list-${repo}-${Date.now()}.txt`;
  fs.writeFileSync(filename, JSON.stringify(userListArray), function (err) {
    if (err) throw err;
  })

  console.log('USER LIST SAVED!\n');
}

async function getRateLimit() {
  const rateLimit = await gitHub.rateLimit.get();
  console.log(`REQUESTS REMAINING: ${rateLimit.data.rate.remaining}`);
}

getAllUsers()
  .then((userListArray) => getAllUserDetails(userListArray)
    .then(userInfo => writeArrayToCSV(userInfo)));
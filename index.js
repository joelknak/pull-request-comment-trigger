#!/usr/bin/env node

const core = require("@actions/core");
const { context, GitHub } = require("@actions/github");

const knakWorkflowTitle = "# Knak Workflow";
const authorWorkflowTitle = "## Author Workflow";
const reviewerWorkflowTitle = "## Reviewer Workflow";

const uncheckedCheckbox = "- [ ] ";
const checkedCheckbox = "- [x] ";

const qaNeededTaskName = "qa-task";
const qaNeededTaskDescription =
  "I am sure that there is no possibility of a regression in this code (Otherwise add label `qa-needed`)";

function setTaskNamesChecked(tasks, startTitle, endTitle, workflowComment) {
  const startIndex = workflowComment.body.indexOf(startTitle);
  let endIndex = workflowComment.body.length;
  if (endTitle) {
    endIndex = workflowComment.body.indexOf(endTitle);
  }
  if (startIndex < 0 || endIndex < 0) {
    return;
  }
  const taskLines = workflowComment.body
    .substring(startIndex + startTitle.length, endIndex)
    .split("\n");

  const regexp = /(- \[[ |x]]).*\[(.*)]$/g;
  taskLines.forEach(taskLine => {
    console.log(`taskLine: ${taskLine}`);
    const captureGroups = [...taskLine.matchAll(regexp)][0];
    if (!captureGroups || captureGroups.length !== 3) {
      console.log(`No capture group`);
      return;
    }
    const checkedStatus = captureGroups[1];
    const taskName = captureGroups[2];
    const task = tasks.find(task => task.name === taskName);
    if (task) {
      console.log(`taskLine2: ${taskLine}`);
      task.isChecked = checkedStatus.includes('x');
    } else {

      console.log(`No task`);
    }
  });
}

function setCheckedTaskCurrentState(
  authorTasks,
  reviewerTasks,
  workflowComment
) {
  if (!workflowComment || !workflowComment.body) {
    return;
  }
  setTaskNamesChecked(
    authorTasks,
    authorWorkflowTitle,
    reviewerWorkflowTitle,
    workflowComment
  );
  setTaskNamesChecked(
    reviewerTasks,
    reviewerWorkflowTitle,
    null,
    workflowComment
  );
}

async function getPR(context, client) {
  let pr = context.payload.pull_request;

  if (context.eventName === "issue_comment" && !pr) {
    let response = await client.pulls.get({
      pull_number: context.payload.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo
    });
    pr = response.data;
  }
  return pr;
}

function createTask(name, description) {
  return {
    name,
    description,
    isChecked: false,
    isVisible: false
  };
}

function findTask(taskList, name) {
  return taskList.find(task => task.name === name);
}

function markVisible(taskList, name) {
  const task = findTask(taskList, name);
  if (task) {
    task.isVisible = true;
  }
}

function labelIsApplied(labels, label) {
  return !!labels.data.find(label => label.name === "qa-needed");
}

function getOutstandingTaskExists(comments) {
  if (comments.data.length) {
    comments.data.forEach(comment => {
      if (comment.body.includes(uncheckedCheckbox)) {
        return true;
      }
    });
  }
  return false;
}

function getWorkflowComment(comments) {
  if (comments.data.length) {
    return comments.data.find(comment =>
      comment.body.startsWith(knakWorkflowTitle)
    );
  }
  return null;
}

function renderTasks(tasks) {
  return tasks
    .filter(task => task.isVisible)
    .map(task => {
      const checkbox = task.isChecked ? checkedCheckbox : uncheckedCheckbox;
      return `${checkbox}${task.description} [${task.name}]\n`;
    });
}

async function run() {
  const { GITHUB_TOKEN } = process.env;
  const client = new GitHub(GITHUB_TOKEN);
  const ownerRepo = {
    owner: context.repo.owner,
    repo: context.repo.repo
  };

  const authorTasks = [];
  const reviewerTasks = [];
  authorTasks.push(createTask(qaNeededTaskName, qaNeededTaskDescription));
  reviewerTasks.push(createTask(qaNeededTaskName, qaNeededTaskDescription));

  const pr = await getPR(context, client);
  const ownerRepoWithPr = {
    ...ownerRepo,
    issue_number: pr.number
  };

  const comments = await client.issues.listComments(ownerRepoWithPr);
  const labels = await client.issues.listLabelsOnIssue(ownerRepoWithPr);

  const workflowComment = getWorkflowComment(comments);
  setCheckedTaskCurrentState(authorTasks, reviewerTasks, workflowComment);

  const qaNeededLabelApplied = labelIsApplied(labels, "qa-needed");
  if (!qaNeededLabelApplied) {
    markVisible(authorTasks, qaNeededTaskName);
    markVisible(reviewerTasks, qaNeededTaskName);
    console.log("authorTasks: " + JSON.stringify(authorTasks));
    console.log("reviewerTasks: " + JSON.stringify(reviewerTasks));
  }

  const outstandingTaskExists = getOutstandingTaskExists(comments);

  const authorWorkflowTasksBody = renderTasks(authorTasks);
  const reviewerWorkflowTasksBody = renderTasks(reviewerTasks);
  let comment = {
    body: `${knakWorkflowTitle}
${authorWorkflowTitle}
${authorWorkflowTasksBody}
${reviewerWorkflowTitle}
${reviewerWorkflowTasksBody}`
  };

  if (workflowComment) {
    await client.issues.updateComment({
      ...ownerRepo,
      comment_id: workflowComment.id,
      ...comment
    });
  } else {
    await client.issues.createComment({
      ...ownerRepo,
      issue_number: pr.number,
      ...comment
    });
  }

  const startTime = new Date().toISOString();

  let check = {
    name: "knak-workflow",
    head_sha: pr.head.sha,
    started_at: startTime,
    status: "completed",
    conclusion: "action_required",
    output: {
      title: "One or more tasks need to be checked off",
      summary:
        "Please check the comments in the PR for any tasks that have not been checked off",
      text:
        "We check if any task lists need completing before you can merge this PR"
    }
  };

  if (!outstandingTaskExists) {
    check.status = "completed";
    check.conclusion = "success";
    check.completed_at = new Date().toISOString();
    check.output.summary = "All tasks have been completed";
  }

  // send check back to GitHub
  return client.checks.create({
    ...ownerRepo,
    ...check
  });
}

run().catch(err => {
  console.error(err);
  core.setFailed("Unexpected error");
});

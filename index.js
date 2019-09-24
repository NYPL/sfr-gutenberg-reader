/* eslint-disable no-await-in-loop */
import GitFetch from './src/githubDataFetch'
import Kinesis from './src/kinesisOutput'
import Helpers from './src/fetchHelpers'
import logger from './src/helpers/logger'

exports.retrieveRepos = async () => {
  let success = false
  let tries = 0

  do {
    logger.notice('Attempting to retrieve records from GITenberg')
    if (success === false) await Helpers.sleep(10000, tries)
    success = await GitFetch.getRepos()
    tries += 1
  } while (success === false && tries < process.env.REPO_RETRIES)

  return success
}

exports.getRepoData = async (repoInfo, lcRels) => {
  const rdfValue = await GitFetch.getRDF(repoInfo, lcRels)
  const coverMeta = await.GitFetch.getCover(repoInfo)
  console.log(coverMeta)
  return rdfValue
}

exports.loadSequentialRepos = async (repoStart, repoCount) => {
  let success = false
  let tries = 0
  do {
    logger.notice(`Attempting to load ${repoCount} GITenberg repos starting at ${ repoStart }`)
    success = GitFetch.getRepoRange(repoStart, repoCount)
    tries++
  } while (success === false && tries < 5)

  return success
}

exports.handler = async (event, context, callback) => {
  let repoInfo = null
  if(event.source === 'local.bulk'){
    repoInfo = await exports.loadSequentialRepos(event.repos.start, event.repos.count)
  } else {
    repoInfo = await exports.retrieveRepos()
  }

  if (repoInfo === false) {
    logger.error('Github API request returned too many 5XX errors')
    return callback(new Error('Github API request returned too many 5XX errors'))
  }

  const lcRels = await Helpers.loadLCRels()
  const repoInfo = success
  if (repoInfo.length === 0) {
    logger.notice('No updates made in the fetch period to GITenberg')
    const emptyResult = {
      source: 'gutenberg',
      status: 204,
      message: 'No records updated in fetch period',
    }
    Kinesis.resultHandler(emptyResult)
    return callback(null, 'No updated records found')
  }

  for (let i = 0; i < repoInfo.length; i += 1) {
    const metadataRec = await exports.getRepoData(repoInfo[i], lcRels)
    logger.debug('Processed GITenberg record')
    Kinesis.resultHandler(metadataRec)
  }

  logger.notice('Successfully updated records')
  return callback(null, 'Successfully updated records')
}

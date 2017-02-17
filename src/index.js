import util from 'util'
import path from 'path'
import fs from 'fs'

import includes from 'lodash.includes'
import merge from 'lodash.merge'
import uuid from 'uuid'
import Dialog from 'dialog-api/lib/messenger'

let dialog = null

const callback = (logger) => {
  return (error, response, body) => {
    if (error) {
      logger.debug('[botpress-dialog] Error: ' + error.message)
    } else if (body && body.error) {
      logger.debug('[botpress-dialog] ' + body.code + ': ' + util.inspect(body.error, false, null))
    }
  }
}

const incomingMiddleware = (event, next) => {
  if (event.platform == 'facebook') {
    let payload = {
      entry: [
        {
          messaging: [event.raw]
        }
      ]
    }

    dialog.incoming(payload, callback(event.bp.logger))
    event.bp.logger.verbose('[botpress-dialog] Incoming message')
  }

  next()
}

const outgoingMiddleware = (event, next) => {
  if (event.platform == 'facebook') {
    // Rebuild response object expected by dialog-api
    let response = {
      message_id: event.__id, // Not the real Facebook message ID, but whatever
      recipient_id: event.raw.to
    }

    // Rebuild payload object expected by dialog-api
    let payload
    if (event.type == 'text') {
      payload = {
        message: {
          text: event.raw.message,
          quick_replies: event.raw.quick_replies
        }
      }
    } else if (event.type == 'template') {
      payload = {
        message: {
          attachment: {
            type: 'template',
            payload: event.raw.payload
          }
        }
      }
    } else if (event.type == 'attachment') {
      payload = {
        message: {
          attachment: {
            type: event.raw.type,
            payload: event.raw
          }
        }
      }
    } else {
      // noop
    }

    if (payload) {
      dialog.outgoing(payload, response, callback(event.bp.logger))
      event.bp.logger.verbose('[botpress-dialog] Outgoing message')
    }
  }

  next()
}

module.exports = {

  config: {
    accessToken : { type: 'string', env: 'DIALOG_TOKEN' },
    botId: { type: 'string' }
  },

  init: async (bp, configurator) => {

    bp.middlewares.register({
      name: 'dialog.outgoing',
      module: 'botpress-dialog',
      type: 'outgoing',
      handler: outgoingMiddleware,
      order: 0,
      description: 'Tracks outgoing messages with Dialog Analytics'
    })

    bp.middlewares.register({
      name: 'dialog.incoming',
      module: 'botpress-dialog',
      type: 'incoming',
      handler: incomingMiddleware,
      order: 0,
      description: 'Tracks incoming messages with Dialog Analytics'
    })

    const { accessToken, botId } = await configurator.loadAll()

    dialog = new Dialog(accessToken, botId)
  },

  ready: (bp, configurator) => {
    const router = bp.getRouter('botpress-dialog')

    router.get('/config', async (req, res) => {
      res.send(await configurator.loadAll())
    })

    router.post('/config', async (req, res) => {
      const { accessToken, botId } = req.body

      configurator.saveAll({ accessToken, botId })

      dialog.apiToken = accessToken
      dialog.botId = botId

      res.sendStatus(200)
    })
  }
}

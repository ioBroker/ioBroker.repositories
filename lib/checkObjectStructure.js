'use strict';

const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

const ROOT_OBJECT_SCHEMA = {
    _id: 'string',
    type: 'string',
    common: 'object',
    native: 'object',
    from: 'string',
    ts: 'number',
    acl: 'object',
    user: 'string',
};

const ALLOWED_OBJECT_TYPES = new Set([
    'state',
    'channel',
    'device',
    'enum',
    'host',
    'adapter',
    'instance',
    'meta',
    'config',
    'script',
    'user',
    'group',
    'chart',
    'folder',
    'schedule',
    'design',
]);

const HIERARCHY_TYPES = new Set(['device', 'channel', 'state', 'folder']);

const VALID_STATE_TYPES = new Set([
    'array',
    'boolean',
    'file',
    'json',
    'mixed',
    'multistate',
    'number',
    'object',
    'string',
]);

const STATE_COMMON_SCHEMA = {
    min: { types: ['number'], onlyForTypes: ['number'] },
    max: { types: ['number'], onlyForTypes: ['number'] },
    step: { types: ['number'], onlyForTypes: ['number'] },
    unit: { types: ['string'] },
    def: { any: true, matchesCommonType: true },
    defAck: { types: ['boolean'] },
    desc: { types: ['string'] },
    read: { types: ['boolean'], required: true },
    write: { types: ['boolean'], required: true },
    role: { types: ['string'], required: true, role: true },
    states: { types: ['object'] },
    workingID: { any: true },
    custom: { any: true },
    type: { types: ['string'], required: true },
    name: { required: true, name: true },
    expert: { types: ['boolean'] },
    dontDelete: { types: ['boolean'] },
    color: { types: ['string'] },
    icon: { types: ['string'] },
};

const FORBIDDEN_ID_CHARS_REGEX = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;
const ID_SUGGESTION_REGEX = /[^a-zA-Z0-9_,-]+/g;

const STATE_ROLE_RULES = {
    "adapter.messagebox": {
        "types": [
            "object"
        ],
        "write": true
    },
    "adapter.wakeup": {
        "types": [
            "boolean"
        ],
        "write": true
    },
    "button": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "button.close.blind": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.close.tilt": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.fastforward": {},
    "button.fastreverse": {},
    "button.forward": {},
    "button.long": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "button.mode.": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.mode.auto": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.mode.manual": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.mode.silent": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.next": {},
    "button.open.blind": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.open.door": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.open.tilt": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.open.window": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.pause": {},
    "button.play": {},
    "button.press": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "button.prev": {},
    "button.resume": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.reverse": {},
    "button.start": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.stop": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.stop.tilt": {
        "types": [
            "boolean"
        ],
        "read": false,
        "write": true
    },
    "button.volume.down": {},
    "button.volume.up": {},
    "chart": {},
    "date": {
        "types": [
            "string",
            "number"
        ]
    },
    "date.end": {},
    "date.forecast.1": {},
    "date.start": {},
    "date.sunrise": {},
    "date.sunset": {},
    "dayofweek": {},
    "html": {
        "types": [
            "string"
        ]
    },
    "indicator": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.alarm": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.alarm.fire": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.alarm.flood": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.alarm.health": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.alarm.secure": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.connected": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.direction": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.error": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.lowbat": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.maintenance": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.maintenance.alarm": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.maintenance.lowbat": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.maintenance.unreach": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.maintenance.waste": {},
    "indicator.reachable": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "indicator.working": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "info.address": {},
    "info.display": {},
    "info.firmware": {},
    "info.hardware": {},
    "info.ip": {},
    "info.mac": {},
    "info.model": {},
    "info.name": {},
    "info.port": {},
    "info.serial": {},
    "info.standby": {},
    "info.status": {},
    "json": {
        "types": [
            "string"
        ]
    },
    "level": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.bass": {},
    "level.battery": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.battery.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.battery.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.blind": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.brightness": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.blue": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.cie": {
        "types": [
            "string"
        ],
        "read": true,
        "write": true
    },
    "level.color.green": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.hue": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.luminance": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.red": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.rgb": {
        "types": [
            "string"
        ],
        "read": true,
        "write": true
    },
    "level.color.rgbw": {
        "types": [
            "string"
        ],
        "read": true,
        "write": true
    },
    "level.color.saturation": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.temperature": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.color.white": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.current": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.current.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.current.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.curtain": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.default": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.dimmer": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.effect": {
        "types": [
            "string"
        ],
        "read": true,
        "write": true
    },
    "level.fill": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.frequency": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.frequency.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.frequency.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.humidity": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.mode.airconditioner": {},
    "level.mode.cleanup": {},
    "level.mode.fan": {},
    "level.mode.swing": {},
    "level.mode.thermostat": {},
    "level.mode.work": {},
    "level.pressure": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.pressure.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.pressure.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.setting.color.temperature": {},
    "level.speed": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.temperature": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.tilt": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.timer": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.timer.sleep": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.treble": {},
    "level.valve": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.voltage": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.voltage.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.voltage.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.volume": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "level.volume.group": {
        "types": [
            "number"
        ],
        "read": true,
        "write": true
    },
    "list": {
        "types": [
            "array"
        ]
    },
    "location": {},
    "media.add": {},
    "media.album": {},
    "media.artist": {},
    "media.bitrate": {},
    "media.broadcastDate": {
        "types": [
            "string"
        ]
    },
    "media.browser": {},
    "media.clear": {},
    "media.content": {},
    "media.cover": {},
    "media.cover.big": {},
    "media.cover.small": {},
    "media.date": {},
    "media.duration": {
        "types": [
            "number"
        ]
    },
    "media.duration.text": {},
    "media.elapsed": {
        "types": [
            "number"
        ]
    },
    "media.elapsed.text": {},
    "media.episode": {
        "types": [
            "string"
        ]
    },
    "media.genre": {},
    "media.input": {},
    "media.jump": {},
    "media.link": {},
    "media.mode.repeat": {
        "types": [
            "boolean"
        ]
    },
    "media.mode.shuffle": {
        "types": [
            "number"
        ]
    },
    "media.mute": {
        "types": [
            "boolean"
        ]
    },
    "media.mute.group": {
        "types": [
            "boolean"
        ]
    },
    "media.playid": {},
    "media.playlist": {},
    "media.season": {
        "types": [
            "string"
        ]
    },
    "media.seek": {
        "types": [
            "number"
        ]
    },
    "media.state": {},
    "media.title": {},
    "media.title.next": {},
    "media.track": {
        "types": [
            "string"
        ]
    },
    "media.tts": {},
    "media.url": {},
    "media.url.announcement": {},
    "sensor": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.alarm": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.alarm.fire": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.alarm.flood": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.alarm.power": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.alarm.secure": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.contact": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.door": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.light": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.lock": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.motion": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.noise": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.rain": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.switch": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "sensor.window": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": false
    },
    "state": {},
    "switch": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.comfort": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.enable": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.gate": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.light": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.lock": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.lock.door": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.lock.window": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.auto": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.boost": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.color": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.manual": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.moonlight": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.party": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.mode.silent": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.pause": {},
    "switch.power": {
        "types": [
            "boolean"
        ],
        "read": true,
        "write": true
    },
    "switch.power.zone": {},
    "switch.setting": {},
    "text": {
        "types": [
            "string"
        ]
    },
    "text.phone": {},
    "text.url": {
        "types": [
            "string"
        ]
    },
    "time.interval": {
        "types": [
            "number"
        ]
    },
    "time.span": {
        "types": [
            "number"
        ]
    },
    "time.timeout": {
        "types": [
            "number"
        ]
    },
    "url": {},
    "url.audio": {},
    "url.blank": {},
    "url.cam": {},
    "url.icon": {},
    "url.same": {},
    "value": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.battery": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.blind": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.blood.sugar": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.brightness": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.clouds": {},
    "value.co2": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.current": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.curtain": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.default": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.direction": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.direction.max.wind": {},
    "value.direction.min.wind": {},
    "value.direction.wind": {},
    "value.direction.wind.forecast.0": {},
    "value.direction.wind.forecast.1": {},
    "value.distance": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.distance.visibility": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.energy": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.energy.active": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.energy.consumed": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.energy.produced": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.energy.reactive": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.fill": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.frequency": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.gate": {},
    "value.gps": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.gps.accuracy": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.gps.elevation": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.gps.latitude": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.gps.longitude": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.gps.radius": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.health.bmi": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.health.bpm": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.health.calories": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.health.fat": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.health.steps": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.health.weight": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.humidity": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.humidity.max": {},
    "value.humidity.min": {},
    "value.interval": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.lock": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.max": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.min": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.mode.airconditioner": {},
    "value.position": {},
    "value.power": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.power.active": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.power.consumed": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.power.consumption": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.power.produced": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.power.production": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.power.reactive": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.precipitation": {},
    "value.precipitation.chance": {},
    "value.precipitation.day.forecast.0": {},
    "value.precipitation.forecast.0": {},
    "value.precipitation.forecast.1": {},
    "value.precipitation.hour": {},
    "value.precipitation.night.forecast.0": {},
    "value.precipitation.today": {},
    "value.precipitation.type": {},
    "value.pressure": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.pressure.forecast.0": {},
    "value.pressure.forecast.1": {},
    "value.radiation": {},
    "value.rain": {},
    "value.rain.hour": {},
    "value.rain.today": {},
    "value.severity": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.snow": {},
    "value.snow.hour": {},
    "value.snow.today": {},
    "value.snowline": {},
    "value.speed": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.speed.max.wind": {},
    "value.speed.min.wind": {},
    "value.speed.wind": {},
    "value.speed.wind.forecast.0": {},
    "value.speed.wind.forecast.1": {},
    "value.speed.wind.gust": {},
    "value.state": {},
    "value.sun.azimuth": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.sun.elevation": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.temperature": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.temperature.dewpoint": {},
    "value.temperature.feelslike": {},
    "value.temperature.max": {},
    "value.temperature.max.forecast.0": {},
    "value.temperature.max.forecast.1": {},
    "value.temperature.min": {},
    "value.temperature.min.forecast.0": {},
    "value.temperature.min.forecast.1": {},
    "value.temperature.windchill": {},
    "value.tilt": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.time": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.timer": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.uv": {},
    "value.valve": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.voltage": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.warning": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "value.waste": {},
    "value.water": {},
    "value.window": {
        "types": [
            "number"
        ],
        "read": true,
        "write": false
    },
    "weather.chart.url": {},
    "weather.chart.url.forecast": {},
    "weather.direction.wind": {},
    "weather.direction.wind.forecast.0": {},
    "weather.html": {},
    "weather.icon": {},
    "weather.icon.forecast.1": {},
    "weather.icon.name": {},
    "weather.icon.wind": {},
    "weather.json": {},
    "weather.state": {},
    "weather.state.forecast.0": {},
    "weather.state.forecast.1": {},
    "weather.title": {},
    "weather.title.forecast.0": {},
    "weather.title.short": {},
    "weather.type": {}
};

for (const ambiguousRole of ['button', 'button.long']) {
    if (STATE_ROLE_RULES[ambiguousRole]) {
        delete STATE_ROLE_RULES[ambiguousRole].read;
        delete STATE_ROLE_RULES[ambiguousRole].write;
    }
}

function getValueType(value) {
    if (Array.isArray(value)) {
        return 'array';
    }

    if (value === null) {
        return 'null';
    }

    return typeof value;
}

function isPlainObject(value) {
    return getValueType(value) === 'object';
}

function isStringOrI18nObject(value) {
    if (typeof value === 'string') {
        return true;
    }

    if (!isPlainObject(value)) {
        return false;
    }

    const values = Object.values(value);
    return values.length > 0 && values.every(entry => typeof entry === 'string');
}

function matchesCommonType(value, commonType) {
    if (commonType === 'mixed') {
        return true;
    }

    if (commonType === 'array') {
        return Array.isArray(value);
    }

    if (commonType === 'boolean') {
        return typeof value === 'boolean';
    }

    if (commonType === 'number') {
        return typeof value === 'number' && Number.isFinite(value);
    }

    if (commonType === 'object') {
        return isPlainObject(value);
    }

    if (commonType === 'string' || commonType === 'file' || commonType === 'json') {
        return typeof value === 'string';
    }

    if (commonType === 'multistate') {
        return ['string', 'number', 'boolean'].includes(typeof value);
    }

    return false;
}

function createLogger(options = {}) {
    const reportLines = [];
    const levelOrder = { debug: 0, info: 1, warn: 2, error: 3 };
    const activeLevel = options.debug ? 'debug' : options.log ? 'info' : null;
    let warningCount = 0;
    let errorCount = 0;

    const emit = (level, message) => {
        if (level === 'debug' && !options.debug) {
            return;
        }

        if (level === 'info' && !options.log && !options.debug) {
            return;
        }

        if (level === 'warn') {
            warningCount += 1;
        } else if (level === 'error') {
            errorCount += 1;
        }

        const line = `[${level.toUpperCase()}] ${message}`;
        reportLines.push(line);

        if (activeLevel && levelOrder[level] >= levelOrder[activeLevel]) {
            console.log(line);
        }
    };

    return {
        debug: message => emit('debug', message),
        info: message => emit('info', message),
        warn: message => emit('warn', message),
        error: message => emit('error', message),
        get warningCount() {
            return warningCount;
        },
        get errorCount() {
            return errorCount;
        },
        get reportLines() {
            return reportLines;
        },
    };
}

function createRoleRuleMaps() {
    const exactRules = new Map();
    const prefixRules = [];

    for (const [role, rule] of Object.entries(STATE_ROLE_RULES)) {
        if (role.endsWith('.')) {
            prefixRules.push({ prefix: role, rule });
        } else {
            exactRules.set(role, rule);
        }
    }

    return { exactRules, prefixRules };
}

function getRoleRule(role, roleRuleMaps) {
    if (roleRuleMaps.exactRules.has(role)) {
        return roleRuleMaps.exactRules.get(role);
    }

    for (const { prefix, rule } of roleRuleMaps.prefixRules) {
        if (role.startsWith(prefix)) {
            return rule;
        }
    }

    if (role.includes('.setting.')) {
        const roleWithoutSetting = role.replace('.setting.', '.');

        if (roleRuleMaps.exactRules.has(roleWithoutSetting)) {
            return roleRuleMaps.exactRules.get(roleWithoutSetting);
        }

        for (const { prefix, rule } of roleRuleMaps.prefixRules) {
            if (roleWithoutSetting.startsWith(prefix)) {
                return rule;
            }
        }
    }

    return null;
}

function validateStateCommon(stateId, common, logger, roleRuleMaps) {
    if (!isPlainObject(common)) {
        logger.error(`Object "${stateId}" common must be an object.`);
        return;
    }

    const unsupportedKeys = Object.keys(common).filter(key => !Object.prototype.hasOwnProperty.call(STATE_COMMON_SCHEMA, key));
    if (unsupportedKeys.length > 0) {
        logger.error(`Object "${stateId}" common contains unsupported keys: ${unsupportedKeys.join(', ')}`);
    }

    for (const [key, schema] of Object.entries(STATE_COMMON_SCHEMA)) {
        const hasValue = Object.prototype.hasOwnProperty.call(common, key);

        if (schema.required && !hasValue) {
            logger.error(`Object "${stateId}" common is missing required key "${key}".`);
            continue;
        }

        if (!hasValue) {
            continue;
        }

        const value = common[key];

        if (schema.types && !schema.types.includes(getValueType(value))) {
            logger.error(`Object "${stateId}" common key "${key}" must be of type ${schema.types.join(' or ')}.`);
            continue;
        }

        if (schema.onlyForTypes && !schema.onlyForTypes.includes(common.type)) {
            logger.error(`Object "${stateId}" common key "${key}" is only allowed for common.type=${schema.onlyForTypes.join(' or ')}.`);
        }

        if (schema.matchesCommonType && common.type && !matchesCommonType(value, common.type)) {
            logger.error(`Object "${stateId}" common key "${key}" must match common.type "${common.type}".`);
        }

        if (schema.name && !isStringOrI18nObject(value)) {
            logger.error(`Object "${stateId}" common key "name" must be a string or i18n object.`);
        }

        if (schema.role) {
            const roleRule = getRoleRule(value, roleRuleMaps);
            if (!roleRule) {
                logger.error(`Object "${stateId}" has unknown role "${value}".`);
                continue;
            }

            if (Array.isArray(roleRule.types) && common.type && !roleRule.types.includes(common.type)) {
                logger.error(`Object "${stateId}" role "${value}" does not support common.type "${common.type}".`);
            }

            if (typeof roleRule.read === 'boolean' && common.read !== roleRule.read) {
                logger.error(`Object "${stateId}" role "${value}" requires common.read=${roleRule.read}.`);
            }

            if (typeof roleRule.write === 'boolean' && common.write !== roleRule.write) {
                logger.error(`Object "${stateId}" role "${value}" requires common.write=${roleRule.write}.`);
            }
        }
    }
}

function validateHierarchyObjectOrder(objectsById, idsToCheck, logger) {
    for (const objectId of idsToCheck) {
        const levels = objectId.split('.');
        const chain = [];

        for (let index = 1; index <= levels.length; index++) {
            const levelId = levels.slice(0, index).join('.');
            const levelObject = objectsById[levelId];

            if (!levelObject) {
                continue;
            }

            chain.push({ id: levelId, type: levelObject.type });
        }

        const containsHierarchyType = chain.some(entry => HIERARCHY_TYPES.has(entry.type));
        if (containsHierarchyType && chain.some(entry => !HIERARCHY_TYPES.has(entry.type))) {
            logger.error(`Object "${objectId}" hierarchy contains non hierarchy object types.`);
        }

        const deviceCount = chain.filter(entry => entry.type === 'device').length;
        if (deviceCount > 1) {
            logger.error(`Object "${objectId}" hierarchy contains more than one device.`);
        }

        const firstChannelIndex = chain.findIndex(entry => entry.type === 'channel');
        if (firstChannelIndex !== -1 && chain.slice(firstChannelIndex + 1).some(entry => entry.type === 'device')) {
            logger.error(`Object "${objectId}" hierarchy contains a device after a channel.`);
        }

        for (let index = 0; index < chain.length - 1; index++) {
            if (chain[index].type === 'state') {
                logger.error(`Object "${objectId}" has a state object "${chain[index].id}" with children.`);
                break;
            }
        }
    }
}

function validateObjectDump(data, options = {}) {
    const logger = createLogger(options);
    const roleRuleMaps = createRoleRuleMaps();

    if (!isPlainObject(data)) {
        logger.error('Input JSON must contain an object at root level.');
        return { logger, relevantIds: [], objectsById: {} };
    }

    const entries = Object.entries(data);
    logger.info(`Loaded ${entries.length} root objects.`);

    for (const [rootKey, rootObject] of entries) {
        if (!isPlainObject(rootObject) || rootObject._id !== rootKey) {
            logger.error(`Root object "${rootKey}" is invalid: expected object with matching _id.`);
        }
    }

    if (logger.errorCount > 0) {
        logger.error('Input is not a valid ioBroker object dump. Processing aborted.');
        return { logger, relevantIds: [], objectsById: data };
    }

    const relevantIds = [];

    for (const [objectId, objectData] of entries) {
        logger.debug(`Processing object "${objectId}".`);

        for (const [requiredKey, expectedType] of Object.entries(ROOT_OBJECT_SCHEMA)) {
            if (!Object.prototype.hasOwnProperty.call(objectData, requiredKey)) {
                logger.error(`Object "${objectId}" is missing required key "${requiredKey}".`);
                continue;
            }

            const actualType = getValueType(objectData[requiredKey]);
            if (actualType !== expectedType) {
                logger.error(`Object "${objectId}" key "${requiredKey}" must be type ${expectedType}, got ${actualType}.`);
            }
        }

        const unsupportedKeys = Object.keys(objectData).filter(key => !Object.prototype.hasOwnProperty.call(ROOT_OBJECT_SCHEMA, key));
        if (unsupportedKeys.length > 0) {
            logger.error(`Object "${objectId}" contains unsupported keys: ${unsupportedKeys.join(', ')}`);
        }

        if (!ALLOWED_OBJECT_TYPES.has(objectData.type)) {
            logger.error(`Object "${objectId}" has unknown type "${objectData.type}".`);
        }

        if (HIERARCHY_TYPES.has(objectData.type)) {
            relevantIds.push(objectId);
        }

        FORBIDDEN_ID_CHARS_REGEX.lastIndex = 0;
        if (FORBIDDEN_ID_CHARS_REGEX.test(objectId)) {
            const sanitizedId = objectId.replace(FORBIDDEN_ID_CHARS_REGEX, '');
            logger.error(`Object id "${objectId}" contains forbidden characters. Suggested cleaned id: "${sanitizedId}".`);
        }

        const suggestionMatches = objectId.match(ID_SUGGESTION_REGEX);
        if (suggestionMatches) {
            const uniqueChars = [...new Set(suggestionMatches.join('').split(''))].join('');
            logger.warn(`Object id "${objectId}" contains non [a-zA-Z0-9_,-] characters (${uniqueChars}). Consider removing them.`);
        }
    }

    for (const objectId of relevantIds) {
        const levels = objectId.split('.');

        for (let index = 2; index < levels.length; index++) {
            const prefix = levels.slice(0, index).join('.');
            if (!Object.prototype.hasOwnProperty.call(data, prefix)) {
                logger.error(`Object "${objectId}" is missing intermediate object "${prefix}".`);
            }
        }
    }

    validateHierarchyObjectOrder(data, relevantIds, logger);

    for (const objectId of relevantIds) {
        const objectData = data[objectId];

        if (objectData.type !== 'state') {
            continue;
        }

        const common = objectData.common;

        if (!isPlainObject(common) || !Object.prototype.hasOwnProperty.call(common, 'type')) {
            logger.error(`State object "${objectId}" must define common.type.`);
            continue;
        }

        if (!VALID_STATE_TYPES.has(common.type)) {
            logger.error(`State object "${objectId}" has invalid common.type "${common.type}".`);
        }

        validateStateCommon(objectId, common, logger, roleRuleMaps);
    }

    return { logger, relevantIds, objectsById: data };
}

function createReportPath(filePath) {
    const directory = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    return path.join(directory, `${baseName}_report.txt`);
}

function checkObjectStructure(filePath, options = {}) {
    const preLogger = createLogger(options);

    const baseName = path.basename(filePath);
    const adapterName = options.adapter;
    const filenamePattern = /^(?<adapter>[a-zA-Z0-9_-]+)\.(?<instance>\d+)\.json$/;
    const filenameMatch = baseName.match(filenamePattern);

    if (!filenameMatch) {
        preLogger.warn(`Filename "${baseName}" does not match required pattern <adapter>.<instance>.json.`);
    } else {
        const { adapter } = filenameMatch.groups;

        if (adapterName && adapter !== adapterName) {
            preLogger.warn(`Filename adapter "${adapter}" does not match --adapter "${adapterName}".`);
        }
    }

    const reportPath = createReportPath(filePath);

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        preLogger.info('Input file is valid JSON.');
    } catch (error) {
        preLogger.error(`Input file is not valid JSON: ${error.message}`);

        const reportLines = [
            `File: ${filePath}`,
            `Adapter: ${adapterName || '<not set>'}`,
            ...preLogger.reportLines,
            '',
            `Summary: errors=${preLogger.errorCount}, warnings=${preLogger.warningCount}`,
        ];

        fs.writeFileSync(reportPath, `${reportLines.join('\n')}\n`, 'utf8');
        return { reportPath, errorCount: preLogger.errorCount, warningCount: preLogger.warningCount };
    }

    const validationResult = validateObjectDump(parsed, options);
    const errorCount = preLogger.errorCount + validationResult.logger.errorCount;
    const warningCount = preLogger.warningCount + validationResult.logger.warningCount;

    const reportLines = [
        `File: ${filePath}`,
        `Adapter: ${adapterName || '<not set>'}`,
        ...preLogger.reportLines,
        ...validationResult.logger.reportLines,
        '',
        `Summary: errors=${errorCount}, warnings=${warningCount}`,
    ];

    fs.writeFileSync(reportPath, `${reportLines.join('\n')}\n`, 'utf8');
    return { reportPath, errorCount, warningCount };
}

function runFromCommandLine(argv = process.argv.slice(2)) {
    const args = minimist(argv, {
        boolean: ['log', 'debug'],
        string: ['adapter'],
    });

    const filePath = args._[0];

    if (!filePath) {
        console.error('Usage: npm run checkObjectStructure -- <filename.json> --adapter <adapterName> [--log] [--debug]');
        process.exitCode = 1;
        return;
    }

    const absolutePath = path.resolve(process.cwd(), filePath);
    const { reportPath, errorCount } = checkObjectStructure(absolutePath, {
        adapter: args.adapter,
        log: args.log,
        debug: args.debug,
    });

    console.log(`Report written to ${reportPath}`);
    process.exitCode = errorCount > 0 ? 1 : 0;
}

if (require.main === module) {
    runFromCommandLine();
}

module.exports = {
    checkObjectStructure,
    createReportPath,
    validateObjectDump,
};

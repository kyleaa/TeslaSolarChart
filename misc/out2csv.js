
const fs = require('fs')
    , wcfg = require('../private/darkskyconfig.json')
    , datapath = '../data/'
let
    startDate = process.argv[2]
    , endDate = process.argv[3]
    , outFileName = process.argv[4]
if (!startDate) startDate = new Date().toISOString().substr(0, 10)
if (!endDate) endDate = startDate

if (process.argv.length < 3) {
    console.log('out2csv startDate endDate')
    process.exit()
}

outputDateRange('te', startDate, endDate)
//outputDateRange('sc', startDate, endDate)
//mergeDays()
//teEnergyWeek()
//process.exit()

function teEnergyWeek() {
    fs.readdirSync(datapath).forEach(f => {
        //let m = f.match(/^mysolarcity.com_measurements_([0-9-]*)_hour.json$/i)
        let m = f.match(/^owner-api.teslamotors.com_energy_([0-9-]*)_week.json$/i)
        if (m) {
            let fdate = m[1]
            console.log(fdate, f)
            //console.log(getSolarCityDay(fdate))
            teLoadEngeryWeek(datapath + f, fdate)
        }
    })
    /*    
    fs.readdirSync(datapath).forEach(f => {
        if(f.endsWith('undefined')) fs.renameSync(datapath + f, datapath + f.replace('undefined',''))
    })
   */
}

function mergeDays() {
    let alldays = []
    fs.readdirSync(datapath).forEach(f => {
        let m = f.match(/^owner-api.teslamotors.com_energy_([0-9-]*)_week.json$/i)
        if (m) {
            //let fdate = m[1]
            let d = loadJsonFile(datapath + f)
            alldays = alldays.concat(d.response.time_series)
        }
    })

    const filteredArr = alldays.reduce((acc, current) => {
        if (!acc.find(i => i.timestamp === current.timestamp))
            return acc.concat([current])
        else return acc
    }, [])

    filteredArr.forEach((d, i) => {
        d.timestamp = d.timestamp.substr(0, 10)
        d.solar_energy_exported = Math.round(d.solar_energy_exported)
        d.grid_energy_imported = Math.round(d.grid_energy_imported)
        d.consumer_energy_imported_from_grid = Math.round(d.consumer_energy_imported_from_grid)
        d.consumer_energy_imported_from_solar = Math.round(d.consumer_energy_imported_from_solar)
        console.log(json2csv(d, i === 0))
        writeJson2csv('alldays.csv', d, i === 0)
    })


}

function teLoadEngeryWeek(fn, fdate) {

    let d = loadJsonFile(fn)
        , ts = d.response.time_series
        , startDate = ts[0].timestamp.substr(0, 10)
    console.log(fdate, d.response.period, ts.length, ts[0].timestamp.substr(0, 10), startDate)
    if (startDate !== fdate) {
        console.log(fn, datapath + `owner-api.teslamotors.com_energy_${startDate}_week.json`)
        fs.renameSync(datapath + fn, datapath + `owner-api.teslamotors.com_energy_${startDate}_week.json`)
    }
    //console.log(d.response.period, ts.length, ts[0].timestamp.substr(0,10), ts[6].timestamp.substr(0,10) )
    //ts.forEach(d => { console.log(d) })
}

function outputDateRange(mode, startDate, endDate) {

    getDatesRange(startDate, endDate).forEach((d, i) => {
        let
            w = getWeather(d), wd = w.daily.data[0]
            , csv
            //, mode = 'sc' //'te'// //use solar city or tesla energy

        if(mode === 'sc'){
            let p = getSolarCityProductionDay(d)
            , c = getSolarCityConsumptionDay(d)
            if(p && c && w)
            csv = PCW2PVO(d, p.TotalEnergyInIntervalkWh * 1000, c.TotalConsumptionInIntervalkWh * 1000, wd)
    
        }
        else{
            csv = getTeslaEnergyDay(d)
            csv = PCW2PVO(csv.date, csv.solar_energy_exported, csv.consumed, wd)

        }
        console.log(d, i, csv)

        if (csv !== null) {
            console.log(json2csv(csv, i === 0))
            writeJson2csv(outFileName, csv, i === 0)
        }

    })

}

function PCW2PVO(d, p, c, wd) {
    return {
        OutputDate: d.replace(/-/g, ''),
        Generated: p,
        Exported: p - c > 0 ? Math.round(p  - c ) : 0,
        PeakPower: '',
        PeakTime: '',
        Condition: '',
        MinTempC: Math.round(f2c(wd.temperatureLow) * 100) / 100,
        MaxTempC: Math.round(f2c(wd.temperatureHigh) * 100) / 100,
        Comments: wd.summary,
        ImportPeak: '',
        ImportOffPeak: '',
        ImportShoulder: '',
        ImportHighShoulder: '',
        Consumption: c
    }
}


function teLoadWeek(fn) {
    let tedata = JSON.parse(fs.readFileSync(fn))
        , ts = tedata.response.time_series
    console.log(tedata.response.period)
    ts.forEach(d => {
        teLoadDay(datapath + `owner-api.teslamotors.com_power_${d.timestamp.substr(0, 10)}_day.json`)
        console.log({
            d: d.timestamp.substr(0, 10).replace(/-/g, ''),
            g: Math.round(d.solar_energy_exported),
            e: Math.round(d.grid_energy_exported_from_solar),
            c: Math.round(d.consumer_energy_imported_from_grid + d.consumer_energy_imported_from_solar)
        })
    })
}


function getTeslaEnergyDay(day) {
    let fn = `${datapath}owner-api.teslamotors.com_power_${day}_day.json`
    let tedata = loadJsonFile(fn)
    if (tedata === null) return null
    let ts = tedata.response.time_series
        , d = ts.filter(o => o.timestamp.substr(0, 10) === ts[0].timestamp.substr(0, 10))
    if (d.length !== 96) console.log('warning, not a full day of data!', d.length)
    return teSumHours(d)
}

function teSumHours(d) {
    let s = {
        date: d[0].timestamp.substr(0, 10),
        solar_energy_exported: Sum(d.map(s => s.solar_power)) / 4,
        grid_energy_imported: Sum(d.map(s => s.grid_power > 0 ? s.grid_power : 0)) / 4,
        grid_energy_exported: Sum(d.map(s => s.grid_power < 0 ? s.grid_power : 0)) / 4,
        //battery_power: Sum(d.map(s => s.battery_power)) / 4,
        //grid_services_power: Sum(d.map(s => s.grid_services_power)) / 4
    }
    s.consumed = s.solar_energy_exported + s.grid_energy_imported + s.grid_energy_exported
    s.consumed_from_solar = s.solar_energy_exported + s.grid_energy_exported
    s.consumed_from_grid = s.grid_energy_imported
    return s
}

function teSumHours2(d) {
    let solar = 0, imported = 0, exported = 0
    d.forEach((o, z) => {
        let solar_power = Math.round(o.solar_power)
            , grid_power = Math.round(o.grid_power)
        solar += solar_power
        if (grid_power < 0) exported -= grid_power
        else imported += grid_power
    })
    return ({ d: d[0].timestamp.substr(0, 10).replace(/-/g, ''), g: solar / 4, e: exported / 4, c: (solar - exported + imported) / 4, i: imported / 4 })
}

function teSumHours1(d) {
    let g = Sum(d.map(s => s.solar_power)) / 4
        , e = Sum(d.map(s => s.grid_power)) / 4
        , c = g + e
    return { d: d[0].timestamp.substr(0, 10).replace(/-/g, ''), g, e, c }
}

function getSolarCityConsumptionDay(date) {
    let fn = datapath + `mysolarcity.com_consumption_${date}_hour.json`
    let c = loadJsonFile(fn)
    if (c === null) return null
    if (!c.Consumption || c.Consumption.length !== 24) {
        console.log(fn + '.invalid.txt renamed', c.Consumption.length)
        fs.renameSync(fn, fn + '.invalid.txt')
        return null
    }
    if (c.Consumption[0].Timestamp.substr(0, 10) !== date) console.log('Production Date dont match')
    return c
}

function getSolarCityProductionDay(date) {
    let fn = datapath + `mysolarcity.com_measurements_${date}_hour.json`
        , p = loadJsonFile(fn)
    if (p === null) return null
    let bPValid = false

    if (p.Devices && p.Devices.length > 1) {
        let d0 = p.Devices[0].Measurements.length
            , d1 = p.Devices[1].Measurements.length

        bPValid = d0 === 24 || d1 === 24
    }

    if (!bPValid) {
        console.log(fn + '.invalid.txt renamed')
        fs.renameSync(fn, fn + '.invalid.txt')
        return null
    }

    if (p.Devices[0].Measurements[0].Timestamp.substr(0, 10) !== date) console.log('Production Date dont match')
    /*
    console.log(c.Consumption[0].Timestamp, c.Consumption.length, c.TotalConsumptionInIntervalkWh)
    console.log(Math.round(Sum(c.Consumption.map(o => o.ConsumptionInIntervalkWh)) * 1000))
    console.log(p.TotalEnergyInIntervalkWh, p.Devices.length, p.Devices[0].Measurements.length)
    let d0 = Sum(p.Devices[0].Measurements.map(o => o.EnergyInIntervalkWh))
    let d1 = Sum(p.Devices[1].Measurements.map(o => o.EnergyInIntervalkWh))
    console.log(d0 + d1)
    */
    return p
}

function getWeather(date) {
    let wfn = datapath + `api.darksky.net_${date}_${wcfg.Lat}_${wcfg.Long}.json`
    let w = loadJsonFile(wfn)
    if (!w) return null
    if (date != new Date(w.daily.data[0].time * 1000).toISOString().substring(0, 10)) console.log('dates dont match')
    return w
}

// *** utils ***
function f2c(f) { return (f - 32) * 5 / 9 }

function Sum(nums) { return nums.reduce((total, sum) => total + sum) }

function getDatesRange(startDate, stopDate) {
    let dateArray = []
        , currentDate = new Date(startDate)
    stopDate = new Date(stopDate)

    while (currentDate <= stopDate) {
        dateArray.push(new Date(currentDate).toISOString().substr(0, 10))
        currentDate.setDate(currentDate.getDate() + 1)
    }
    return dateArray
}

function writeJson2csv(filename, j, bHeader) {
    if (isEmpty(j)) return
    let EOL = require('os').EOL
    if (bHeader) {
        if (fs.existsSync(filename)) fs.unlinkSync(filename)
        fs.appendFileSync(filename, json2csv(j, true) + EOL)
    }
    fs.appendFileSync(filename, json2csv(j) + EOL)
}

function json2csv1(j, bHeader) {
    let v = bHeader ? Object.keys(j) : Object.values(j)
    return JSON.stringify(v).slice(1).slice(0, -1)
}

function json2csv(j, bHeader) {
    if (!j) return j
    let v = bHeader ? Object.keys(j) : Object.values(j)
    return v.join(',')
}

function isEmpty(obj) { return obj && Object.entries(obj).length === 0 && obj.constructor === Object }

function loadJsonFile(fn) {
    if (!fs.existsSync(fn)) {
        console.log(`${fn} not found!`)
        return null
    }
    try {
        return JSON.parse(fs.readFileSync(fn))
    } catch (e) {
        return null
    }
}

# pingdom-to-graphite

> A tool for copying metrics from Pingdom to Graphite.

## Install

```bash
$ npm install -g git+https://github.com/ovh/pingdom-to-graphite.git
```

## Usage

```bash
$ pingdom-to-graphite --help

  Usage: pingdom-to-graphite [options] [command]

  Options:
    -h, --help           output usage information

  Commands:
    list [options]                 List all your available Pingdom checks and TMs
    probes [options]               List all the Pingdom probes
    advice [options]               Gives you some advice about your quota
    init [options]                 Add your checks to your manifest file.
    update [options]               Get the status of the Checks and the TMs (up/down) since the last update, and push them to Graphite.
    updateCurrentStatus [options]  Get the status of the Checks and the TMs (up/down) for NOW (only), and push them to Graphite.
```

### Example

```bash
$ pingdom-to-graphite list --config="/path/to/config/file"
```

## Configuration

Create a config file with the following configuration:
```yaml
manifest: ./manifest.json     # The location of your manifest file
pingdom:
  apiToken: 'XXX'             # Your Pingdom Read-Only API Key
  appKey: 'XXX'               # Your Pingdom appKey (@todo to remove when Pingdom have migrated its API)
  username: 'XXX'             # Your Pingdom username (@todo to remove when Pingdom have migrated its API)
  password: 'XXX'             # Your Pingdom password (@todo to remove when Pingdom have migrated its API)
  accountEmail: 'XXX'         # Your Pingdom accountEmail (@todo to remove when Pingdom have migrated its API)
  regex: '.*'                 # (optional) use this regex to filter the list
  tags: []                    # (optional) Array of tags, to filter the list
graphite:
  hostname: XXX               # Your Graphite hostname
  auth: 'u:XXX'               # Your Graphite auth (user:token)
  prefix: XXX                 # (optional, default="pingdom") Your Graphite prefix
```

You can create your config file in **JSON** or **YAML** format.

## Commands

First, you've to initialize your manifest.json file, using the command:

```bash
$ pingdom-to-graphite init --config="/path/to/config/file"
```

This will add all your checks IDs, TMs IDs and probes IDs into it. You can filter the list using the "regex" in your config file.

If you want to list them, you can use the command:

```bash
$ pingdom-to-graphite list --config="/path/to/config/file"
```

You can now run the command to get the latest datas from Pingdom, and push them to Graphite:

```bash
$ pingdom-to-graphite update --config="/path/to/config/file" [--summary]
```

The first time that you'll run this command, it'll grab the datas from the last hour.

The second time (and so on...) that you'll run this command, it'll grab all the datas since the previous time (based on the manifest.json file).

Put this command in a hourly CRON and that's it :)! Don't forget to store your manifest.json file!

Note that you can add the option `--summary`, to get only a summary (outages, avg response times,...) without probes datas.

You can also use the command:

```bash
$ pingdom-to-graphite updateCurrentStatus --config="/path/to/config/file"
```

To get the status of the Checks and the TMs (up/down) for NOW (only) - the current datas, and push them to Graphite.

## Credits

This app is based on the work from lewg: https://github.com/lewg/pingdom-to-graphite.

## License

[BSD-3-Clause](LICENSE) © OVH SAS

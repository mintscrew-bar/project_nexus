import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Interaction,
  VoiceChannel,
} from "discord.js";
import type { DiscordVoiceService } from "./discord-voice.service";

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private rest: REST;
  private voiceService: DiscordVoiceService | null = null;

  constructor(private readonly configService: ConfigService) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.rest = new REST({ version: "10" }).setToken(
      this.configService.get("DISCORD_BOT_TOKEN") || "",
    );
  }

  async onModuleInit() {
    const token = this.configService.get("DISCORD_BOT_TOKEN");
    const clientId = this.configService.get("DISCORD_CLIENT_ID");
    const guildId = this.configService.get("DISCORD_GUILD_ID");

    if (!token || !clientId || !guildId ||
        token.includes("your-") || clientId.includes("your-") || guildId.includes("your-")) {
      console.warn(
        "Discord bot not properly configured, skipping bot initialization",
      );
      return;
    }

    try {
      this.setupEventHandlers();
      await this.registerCommands();
      await this.client.login(token);
      console.log("Discord bot initialized");
    } catch (error) {
      console.warn("Failed to initialize Discord bot:", error instanceof Error ? error.message : error);
    }
  }

  async onModuleDestroy() {
    this.client.destroy();
  }

  private setupEventHandlers() {
    this.client.on("ready", () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on("interactionCreate", this.handleInteraction.bind(this));
  }

  private async registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName("nexus")
        .setDescription("Nexus tournament commands")
        .addSubcommand((sub) =>
          sub.setName("link").setDescription("Link your Discord to Nexus"),
        )
        .addSubcommand((sub) =>
          sub.setName("profile").setDescription("View your Nexus profile"),
        )
        .addSubcommand((sub) =>
          sub.setName("auction").setDescription("View current auction status"),
        ),
    ].map((cmd) => cmd.toJSON());

    const guildId = this.configService.get("DISCORD_GUILD_ID");

    if (guildId) {
      await this.rest.put(
        Routes.applicationGuildCommands(
          this.configService.get("DISCORD_CLIENT_ID") || "",
          guildId,
        ),
        { body: commands },
      );
    }
  }

  private async handleInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "nexus") {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "link":
          await this.handleLinkCommand(interaction);
          break;
        case "profile":
          await this.handleProfileCommand(interaction);
          break;
        case "auction":
          await this.handleAuctionCommand(interaction);
          break;
      }
    }
  }

  private async handleLinkCommand(interaction: any) {
    const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";

    await interaction.reply({
      content: `Visit ${appUrl}/auth/login to link your Discord account!`,
      ephemeral: true,
    });
  }

  private async handleProfileCommand(interaction: any) {
    await interaction.reply({
      content: "Profile command - to be implemented",
      ephemeral: true,
    });
  }

  private async handleAuctionCommand(interaction: any) {
    await interaction.reply({
      content: "Auction command - to be implemented",
      ephemeral: true,
    });
  }

  // Utility methods for voice channel management
  async moveToVoiceChannel(guildId: string, userId: string, channelId: string) {
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    const channel = (await guild.channels.fetch(channelId)) as VoiceChannel;

    if (member.voice.channel && channel) {
      await member.voice.setChannel(channel);
      return true;
    }

    return false;
  }

  async sendNotification(guildId: string, channelId: string, message: string) {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (channel?.isTextBased()) {
      await channel.send(message);
    }
  }

  // Methods required by DiscordModule
  getClient(): Client {
    return this.client;
  }

  setVoiceService(voiceService: DiscordVoiceService): void {
    this.voiceService = voiceService;
  }
}

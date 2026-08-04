#See https://aka.ms/containerfastmode to understand how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /src
# The .NET 8+ images run as the non-root "app" user, so the ports must be >1024.
EXPOSE 8080
EXPOSE 8443
# Avatar uploads are written to <cwd>/wwwroot/images; empty folders are not published,
# so the directory has to exist and be writable by the non-root user.
RUN mkdir -p /src/wwwroot/images && chown -R app:app /src

# The SPA is built here rather than by the csproj's BuildSpa target, because the .NET SDK
# image ships no Node. Its own stage also means edits to the C# do not invalidate the npm
# layers, and vice versa.
FROM node:22-alpine AS spa
WORKDIR /spa
COPY WebChat/ClientApp/package.json WebChat/ClientApp/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY WebChat/ClientApp/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["WebChat/WebChat.csproj", "WebChat/"]
COPY ["WebChat.AvatarWriter/WebChat.AvatarWriter.csproj", "WebChat.AvatarWriter/"]
COPY ["WebChat.Connection/WebChat.Connection.csproj", "WebChat.Connection/"]
COPY ["WebChat.Data/WebChat.Models.csproj", "WebChat.Data/"]
COPY ["WebChat.Services/WebChat.Services.csproj", "WebChat.Services/"]
COPY ["WebChat.Hub/WebChat.Hubs.csproj", "WebChat.Hub/"]
RUN dotnet restore "WebChat/WebChat.csproj"
COPY . .
WORKDIR "/src/WebChat"
RUN dotnet build "WebChat.csproj" -c Release -o /app/build

FROM build AS publish
# IncludeSpaOutput picks these up and maps them to ClientApp/dist in the published output;
# SkipSpaBuild stops it also trying to run npm, which does not exist in this image.
COPY --from=spa /spa/dist /src/WebChat/ClientApp/dist
RUN dotnet publish "WebChat.csproj" -c Release -o /app/publish -p:SkipSpaBuild=true

FROM base AS final
WORKDIR /src
COPY --from=publish --chown=app:app /app/publish .
USER app
ENTRYPOINT ["dotnet", "WebChat.dll"]

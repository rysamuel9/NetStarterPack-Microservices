FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 5088
ENV ASPNETCORE_URLS=http://+:5088

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj src/BuildingBlocks/BuildingBlocks.Core/
COPY src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj src/BuildingBlocks/BuildingBlocks.Security/
COPY src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj src/BuildingBlocks/BuildingBlocks.Infrastructure/
COPY src/Services/Notification/Notification.Api/Notification.Api.csproj src/Services/Notification/Notification.Api/
RUN dotnet restore src/Services/Notification/Notification.Api/Notification.Api.csproj

COPY src/BuildingBlocks/ src/BuildingBlocks/
COPY src/Services/Notification/ src/Services/Notification/
RUN dotnet publish src/Services/Notification/Notification.Api/Notification.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Notification.Api.dll"]
